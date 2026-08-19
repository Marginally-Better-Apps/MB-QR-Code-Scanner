import { AVFoundationScannerObservationSource } from './avFoundation';
import { resolveCameraAccessState } from './cameraAccess';
import { CameraAccessFixtureProvider } from './cameraFixtures';
import { makeObservationSource } from './factory';
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
  hasPreview = false;
  revision = 0;

  private readonly cameraAccess: CameraAccessProviding;
  private readonly observationSource: ScannerObservationSource;
  private isObservationSourceRunning = false;
  private scenePhase: ScannerLifecyclePhase = 'active';
  private presentation: ScannerPresentation = 'visible';
  private readonly listeners = new Set<() => void>();

  constructor(input: {
    cameraAccess: CameraAccessProviding;
    observationSource: ScannerObservationSource;
  }) {
    this.cameraAccess = input.cameraAccess;
    this.observationSource = input.observationSource;
    this.cameraAccessState = resolveCameraAccessState(
      input.cameraAccess.authorization,
      input.cameraAccess.cameraAvailable,
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
      this.emit();
    });
    this.hasPreview = this.observationSource.hasPreview;
    this.emit();
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
