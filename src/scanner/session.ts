import type { AcceptedScan, ScanAcceptanceState } from './acceptance';
import { createInitialScanAcceptanceState, updateScanAcceptance } from './acceptance';
import { AVFoundationScannerObservationSource } from './avFoundation';
import { resolveCameraAccessState } from './cameraAccess';
import { CameraAccessFixtureProvider } from './cameraFixtures';
import { makeObservationSource } from './factory';
import { parseQRPayload } from './payloadParser';
import {
  BoundedMetadataQueue,
  LOW_POWER_MIN_FRAME_INTERVAL_MS,
  MAX_METADATA_QUEUE_DEPTH,
  PerformanceSignposts,
  shouldDeliverThrottledFrame,
  type PerformanceClock,
  type ScannerPerformanceMode,
} from './performance';
import {
  rankMultiCodeCandidates,
  resolveMultiCodeWinner,
  stableCandidateId,
  type ScoredMultiCodeCandidate,
} from './multiCode';
import type {
  AppTab,
  CameraAccessProviding,
  CameraAccessState,
  ScannerLifecyclePhase,
  ScannerObservation,
  ScannerObservationSource,
  ScannerPresentation,
} from './types';

export class ScannerSessionStore {
  cameraAccessState: CameraAccessState;
  visibleObservations: ScannerObservation[] = [];
  currentResult: ScannerObservation | null = null;
  multiCodeCandidates: ScoredMultiCodeCandidate[] = [];
  isMultiCodeAmbiguous = false;
  hasPreview = false;
  hasAcceptedScan = false;
  revision = 0;

  private readonly cameraAccess: CameraAccessProviding;
  private readonly observationSource: ScannerObservationSource;
  private onAcceptedScan: ((accepted: AcceptedScan) => void) | null;
  private acceptanceState: ScanAcceptanceState = createInitialScanAcceptanceState();
  private isObservationSourceRunning = false;
  private scenePhase: ScannerLifecyclePhase = 'active';
  private presentation: ScannerPresentation = 'visible';
  private readonly listeners = new Set<() => void>();
  private stabilityById = new Map<string, number>();
  private lastCandidateIds = new Set<string>();
  private manualCandidateId: string | null = null;
  private readonly performanceClock: PerformanceClock;
  /** Budget signposts (QLT-04): authorization -> preview, first sighting -> accept. */
  private readonly signposts: PerformanceSignposts;
  /** Bounded backlog for re-entrant metadata bursts (QLT-04). */
  private readonly metadataQueue = new BoundedMetadataQueue<ScannerObservation[]>(
    MAX_METADATA_QUEUE_DEPTH,
  );
  private isProcessingFrame = false;
  private performanceModeValue: ScannerPerformanceMode = 'full';
  private lastDeliveredFrameAtMs: number | null = null;
  private throttledFrameCount = 0;
  private disposed = false;

  constructor(input: {
    cameraAccess: CameraAccessProviding;
    observationSource: ScannerObservationSource;
    /**
     * Invoked exactly for acceptance-gate events (HIS-01 history recording).
     * Observations that never stabilize never reach this callback, so they
     * can never create persistent rows.
     */
    onAcceptedScan?: (accepted: AcceptedScan) => void;
    /** Injectable ms clock for the performance signposts (QLT-04). */
    performanceNow?: PerformanceClock;
  }) {
    this.cameraAccess = input.cameraAccess;
    this.observationSource = input.observationSource;
    this.onAcceptedScan = input.onAcceptedScan ?? null;
    this.performanceClock = input.performanceNow ?? (() => Date.now());
    this.signposts = new PerformanceSignposts(this.performanceClock);
    this.cameraAccessState = resolveCameraAccessState(
      input.cameraAccess.authorization,
      input.cameraAccess.cameraAvailable,
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  get performanceMode(): ScannerPerformanceMode {
    return this.performanceModeValue;
  }

  /**
   * Switches between full-rate and thermal-friendly scanning (QLT-04).
   * Low-power mode coalesces high-rate observation frames and is forwarded
   * to the native preview so device-side detection can skip frames too.
   */
  setPerformanceMode(mode: ScannerPerformanceMode): void {
    if (this.performanceModeValue === mode) {
      return;
    }
    this.performanceModeValue = mode;
    this.lastDeliveredFrameAtMs = null;
    this.emit();
  }

  /**
   * Observable performance counters for the documented measurement runs:
   * backlog depth, coalesced drops, throttled frames, and budget verdicts.
   */
  performanceMetrics(): {
    mode: ScannerPerformanceMode;
    backlogDepth: number;
    droppedFrames: number;
    throttledFrames: number;
    previewLatencyMs: number | null;
    acceptedResultLatencyMs: number | null;
    meetsPreviewBudget: boolean;
    meetsAcceptedResultBudget: boolean;
  } {
    return {
      mode: this.performanceModeValue,
      backlogDepth: this.metadataQueue.depth,
      droppedFrames: this.metadataQueue.droppedTotal,
      throttledFrames: this.throttledFrameCount,
      previewLatencyMs: this.signposts.previewLatencyMs(),
      acceptedResultLatencyMs: this.signposts.acceptedResultLatencyMs(),
      meetsPreviewBudget: this.signposts.meetsPreviewBudget(),
      meetsAcceptedResultBudget: this.signposts.meetsAcceptedResultBudget(),
    };
  }

  /**
   * Tears down capture and releases everything the session holds (QLT-04):
   * stops the observation source, drops listeners, clears frame-derived
   * state, and detaches the acceptance listener so repeated tab changes and
   * background/resume cycles return memory near baseline with no retained
   * controller/session leak.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.observationSource.stop();
    this.isObservationSourceRunning = false;
    this.listeners.clear();
    this.onAcceptedScan = null;
    this.visibleObservations = [];
    this.multiCodeCandidates = [];
    this.isMultiCodeAmbiguous = false;
    this.currentResult = null;
    this.manualCandidateId = null;
    this.stabilityById = new Map();
    this.lastCandidateIds = new Set();
    this.metadataQueue.clear();
    this.hasPreview = false;
    this.hasAcceptedScan = false;
  }

  /**
   * Late-attaches (or detaches) the acceptance-gate listener used for
   * history recording. Lets the app open the persistent store
   * asynchronously after the session already exists.
   */
  setAcceptedScanListener(listener: ((accepted: AcceptedScan) => void) | null): void {
    this.onAcceptedScan = listener;
  }

  get isCameraActive(): boolean {
    return this.cameraAccessState === 'ready';
  }

  get isCapturing(): boolean {
    return this.shouldCapture && this.isObservationSourceRunning;
  }

  get usesCustomCameraGestures(): boolean {
    return (
      this.observationSource instanceof AVFoundationScannerObservationSource &&
      this.observationSource.usesCustomCameraGestures
    );
  }

  get engineID(): string {
    return this.observationSource.engineID;
  }

  async activateScanner(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.refreshCameraAccess();

    if (this.cameraAccessState !== 'notDetermined') {
      this.markAuthorizationGrantedIfReady();
      this.updateObservationSourceActivity();
      this.emit();
      return;
    }

    await this.cameraAccess.requestAuthorization();
    this.refreshCameraAccess();
    this.markAuthorizationGrantedIfReady();
    this.updateObservationSourceActivity();
    this.emit();
  }

  resumeFromSettings(): void {
    this.cameraAccess.refreshAuthorization();
    this.refreshCameraAccess();
    this.updateObservationSourceActivity();
    this.emit();
  }

  handleLifecycle(phase: ScannerLifecyclePhase): void {
    if (this.disposed) {
      return;
    }
    this.scenePhase = phase;
    switch (phase) {
      case 'background':
      case 'inactive':
        this.observationSource.handleLifecycle(phase);
        this.releaseSessionOnlySecret();
        break;
      case 'active':
        this.cameraAccess.refreshAuthorization();
        this.refreshCameraAccess();
        this.updateObservationSourceActivity();
        if (this.shouldCapture) {
          this.observationSource.handleLifecycle('active');
        }
        break;
    }
    this.emit();
  }

  handlePresentation(presentation: ScannerPresentation): void {
    if (this.disposed) {
      return;
    }
    this.presentation = presentation;
    switch (presentation) {
      case 'obscured':
        this.observationSource.handleLifecycle('inactive');
        break;
      case 'visible':
        this.updateObservationSourceActivity();
        if (this.shouldCapture) {
          this.observationSource.handleLifecycle('active');
        }
        break;
    }
    this.emit();
  }

  handlePreviewLayoutChange(): void {
    if (this.observationSource instanceof AVFoundationScannerObservationSource) {
      this.observationSource.handlePreviewLayoutChange();
    }
  }

  setHasPreview(hasPreview: boolean): void {
    this.hasPreview = hasPreview;
    if (hasPreview) {
      this.signposts.markPreviewReady();
    }
    this.emit();
  }

  private markAuthorizationGrantedIfReady(): void {
    if (this.cameraAccessState === 'ready') {
      this.signposts.markAuthorizationGranted();
    }
  }

  private releaseSessionOnlySecret(): void {
    if (this.currentResult == null) {
      return;
    }
    const parsed = parseQRPayload(this.currentResult.rawPayload);
    if (parsed.sensitivity === 'sessionOnly') {
      this.currentResult = null;
      this.manualCandidateId = null;
    }
  }

  clearCurrentResult(): void {
    if (this.currentResult === null && this.manualCandidateId === null) {
      return;
    }
    this.currentResult = null;
    this.manualCandidateId = null;
    this.emit();
  }

  /**
   * Accept exactly the chosen candidate payload (SCN-05 chooser).
   * Returns true when the id matches a currently visible candidate.
   * The choice sticks across ambiguous updates until cleared or a
   * clearly dominant candidate auto-wins.
   */
  selectCandidate(candidateId: string): boolean {
    const match = this.visibleObservations.find(
      (observation) => stableCandidateId(observation.rawPayload) === candidateId,
    );
    if (!match) {
      return false;
    }
    this.manualCandidateId = candidateId;
    this.currentResult = match;
    this.emit();
    return true;
  }

  beginPinchZoom(): void {
    if (this.observationSource instanceof AVFoundationScannerObservationSource) {
      this.observationSource.beginPinchZoom();
    }
  }

  updatePinchZoom(
    scale: number,
    atNormalizedPoint: { x: number; y: number },
    resultActionRect: { x: number; y: number; width: number; height: number } | null,
  ): void {
    if (this.observationSource instanceof AVFoundationScannerObservationSource) {
      this.observationSource.updatePinchZoom(
        scale,
        atNormalizedPoint,
        resultActionRect,
        () => {},
      );
    }
  }

  focus(
    atNormalizedPoint: { x: number; y: number },
    resultActionRect: { x: number; y: number; width: number; height: number } | null,
  ): void {
    if (this.observationSource instanceof AVFoundationScannerObservationSource) {
      this.observationSource.focus(atNormalizedPoint, resultActionRect, () => {});
    }
  }

  private get shouldCapture(): boolean {
    return (
      this.cameraAccessState === 'ready' &&
      this.scenePhase === 'active' &&
      this.presentation === 'visible'
    );
  }

  private refreshCameraAccess(): void {
    this.cameraAccessState = resolveCameraAccessState(
      this.cameraAccess.authorization,
      this.cameraAccess.cameraAvailable,
    );
  }

  private updateObservationSourceActivity(): void {
    if (!this.shouldCapture) {
      this.observationSource.stop();
      this.isObservationSourceRunning = false;
      this.hasPreview = false;
      return;
    }

    if (this.isObservationSourceRunning) {
      return;
    }

    this.isObservationSourceRunning = true;
    this.observationSource.start((frame) => {
      this.handleIncomingFrame(frame);
    });
    this.hasPreview = this.observationSource.hasPreview;
    this.emit();
  }

  /**
   * Routes every metadata callback through the bounded queue (QLT-04).
   * The JS bridge delivers synchronously, so normally each frame is
   * processed inline; re-entrant bursts (a listener synchronously producing
   * more frames) queue with a drop-oldest policy instead of growing without
   * bound, and low-power mode coalesces high-rate frames before processing.
   */
  private handleIncomingFrame(frame: ScannerObservation[]): void {
    if (this.disposed) {
      return;
    }
    if (this.isProcessingFrame) {
      this.metadataQueue.push(frame);
      return;
    }
    this.isProcessingFrame = true;
    try {
      this.deliverFrameIfAllowed(frame);
      let pending = this.metadataQueue.drain();
      while (pending.length > 0) {
        for (const queued of pending) {
          this.deliverFrameIfAllowed(queued);
        }
        pending = this.metadataQueue.drain();
      }
    } finally {
      this.isProcessingFrame = false;
    }
  }

  private deliverFrameIfAllowed(frame: ScannerObservation[]): void {
    if (
      this.performanceModeValue === 'lowPower' &&
      frame.length > 0 &&
      !shouldDeliverThrottledFrame(
        this.lastDeliveredFrameAtMs,
        this.performanceClock(),
        LOW_POWER_MIN_FRAME_INTERVAL_MS,
      )
    ) {
      this.throttledFrameCount += 1;
      return;
    }
    if (frame.length > 0) {
      this.lastDeliveredFrameAtMs = this.performanceClock();
      this.signposts.markFirstObservation();
    }
    this.processFrame(frame);
  }

  private processFrame(frame: ScannerObservation[]): void {
    this.visibleObservations = frame;
    if (frame.length > 0) {
      this.hasAcceptedScan = true;
    }
    this.recordGatedAcceptances(frame);
    this.updateMultiCodeState(frame);
    this.emit();
  }

  private recordGatedAcceptances(frame: ScannerObservation[]): void {
    const result = updateScanAcceptance(
      this.acceptanceState,
      frame.map((observation) => observation.rawPayload),
      new Date(),
    );
    this.acceptanceState = result.state;
    if (result.accepted.length > 0) {
      this.signposts.markAcceptedResult();
    }
    if (this.onAcceptedScan == null) {
      return;
    }
    for (const accepted of result.accepted) {
      this.onAcceptedScan(accepted);
    }
  }

  private updateMultiCodeState(frame: ScannerObservation[]): void {
    if (frame.length === 0) {
      // Empty frames never clear the sticky result; keep candidates empty.
      this.multiCodeCandidates = [];
      this.isMultiCodeAmbiguous = false;
      this.lastCandidateIds = new Set();
      return;
    }

    // Track consecutive-frame stability per stable id.
    const nextCounts = new Map<string, number>();
    const seenInFrame = new Set<string>();
    const deduped: { id: string; observation: ScannerObservation }[] = [];
    for (const observation of frame) {
      const id = stableCandidateId(observation.rawPayload);
      if (id === '' || seenInFrame.has(id)) {
        continue;
      }
      seenInFrame.add(id);
      const prev = this.stabilityById.get(id) ?? 0;
      const count = this.lastCandidateIds.has(id) ? prev + 1 : 1;
      nextCounts.set(id, count);
      deduped.push({ id, observation });
    }
    this.stabilityById = nextCounts;
    this.lastCandidateIds = seenInFrame;

    const ranked = rankMultiCodeCandidates(
      deduped.map(({ observation }) => ({
        rawPayload: observation.rawPayload,
        bounds: observation.displayBounds,
        stability: nextCounts.get(stableCandidateId(observation.rawPayload)) ?? 1,
      })),
    );
    this.multiCodeCandidates = ranked;

    if (ranked.length <= 1) {
      this.isMultiCodeAmbiguous = false;
      if (ranked.length === 1) {
        const sole = deduped.find((entry) => entry.id === ranked[0].id)?.observation ?? frame[0];
        const currentId =
          this.currentResult != null ? stableCandidateId(this.currentResult.rawPayload) : null;
        if (currentId !== ranked[0].id) {
          this.currentResult = sole;
          this.manualCandidateId = null;
        }
      }
      return;
    }

    const currentId =
      this.currentResult != null ? stableCandidateId(this.currentResult.rawPayload) : null;
    const resolution = resolveMultiCodeWinner({ ranked, currentId });
    this.isMultiCodeAmbiguous = resolution.isAmbiguous;
    if (!resolution.isAmbiguous && resolution.winnerId != null) {
      if (currentId !== resolution.winnerId) {
        const winner = deduped.find((entry) => entry.id === resolution.winnerId)?.observation;
        if (winner) {
          this.currentResult = winner;
          this.manualCandidateId = null;
        }
      }
      return;
    }
    // Ambiguous: preserve the current result object identity (never round-robin).
  }

  private emit(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export class AppState {
  selectedTab: AppTab;
  revision = 0;
  readonly scannerSession: ScannerSessionStore;
  private readonly listeners = new Set<() => void>();

  constructor(input?: {
    selectedTab?: AppTab;
    scannerSession?: ScannerSessionStore;
  }) {
    this.selectedTab = input?.selectedTab ?? 'scanner';
    this.scannerSession =
      input?.scannerSession ??
      new ScannerSessionStore({
        cameraAccess: new CameraAccessFixtureProvider({
          authorization: 'authorized',
        }),
        observationSource: makeObservationSource({
          dataScannerSupported: true,
          fixturesEnabled: true,
        }),
      });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSelectedTab(tab: AppTab): void {
    this.selectedTab = tab;
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
