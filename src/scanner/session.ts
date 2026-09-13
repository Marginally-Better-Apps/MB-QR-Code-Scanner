import type { AcceptedScan, ScanAcceptanceState } from './acceptance';
import { createInitialScanAcceptanceState, updateScanAcceptance } from './acceptance';
import { AVFoundationScannerObservationSource } from './avFoundation';
import { resolveCameraAccessState } from './cameraAccess';
import { CameraAccessFixtureProvider } from './cameraFixtures';
import { makeObservationSource } from './factory';
import { parseQRPayload } from './payloadParser';
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

  constructor(input: {
    cameraAccess: CameraAccessProviding;
    observationSource: ScannerObservationSource;
    /**
     * Invoked exactly for acceptance-gate events (HIS-01 history recording).
     * Observations that never stabilize never reach this callback, so they
     * can never create persistent rows.
     */
    onAcceptedScan?: (accepted: AcceptedScan) => void;
  }) {
    this.cameraAccess = input.cameraAccess;
    this.observationSource = input.observationSource;
    this.onAcceptedScan = input.onAcceptedScan ?? null;
    this.cameraAccessState = resolveCameraAccessState(
      input.cameraAccess.authorization,
      input.cameraAccess.cameraAvailable,
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
    this.refreshCameraAccess();

    if (this.cameraAccessState !== 'notDetermined') {
      this.updateObservationSourceActivity();
      this.emit();
      return;
    }

    await this.cameraAccess.requestAuthorization();
    this.refreshCameraAccess();
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
    this.emit();
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
      this.visibleObservations = frame;
      if (frame.length > 0) {
        this.hasAcceptedScan = true;
      }
      this.recordGatedAcceptances(frame);
      this.updateMultiCodeState(frame);
      this.emit();
    });
    this.hasPreview = this.observationSource.hasPreview;
    this.emit();
  }

  private recordGatedAcceptances(frame: ScannerObservation[]): void {
    if (this.onAcceptedScan == null) {
      return;
    }
    const result = updateScanAcceptance(
      this.acceptanceState,
      frame.map((observation) => observation.rawPayload),
      new Date(),
    );
    this.acceptanceState = result.state;
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
