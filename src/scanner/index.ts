export { resolveCameraAccessState } from './cameraAccess';
export { decideScannerEngine } from './engineSelector';
export {
  boundingRect,
  hitTarget,
  mapObservation,
  normalizedBounds,
  ScannerRecognitionRegion,
  ScannerPreviewPresentation,
  videoOrientationForInterface,
  zoomFactor,
} from './geometry';
export {
  AVFoundationScannerObservationSource,
  avFoundationProductConfiguration,
} from './avFoundation';
export type {
  AVFoundationRecognizedBarcode,
  AVFoundationScannerConfiguration,
  AVFoundationScannerControlling,
  AVFoundationScannerEventSink,
  AVFoundationScannerPlatform,
} from './avFoundation';
export {
  VisionKitScannerObservationSource,
  visionKitProductConfiguration,
} from './visionKit';
export type {
  VisionKitRecognizedBarcode,
  VisionKitScannerConfiguration,
  VisionKitScannerControlling,
  VisionKitScannerEventSink,
  VisionKitScannerPlatform,
} from './visionKit';
export {
  EDGE_CODE_FIXTURE,
  ScannerObservationFixtureSource,
  SINGLE_CODE_FIXTURE,
} from './fixtures';
export type { ScannerFixtureDetection } from './fixtures';
export { makeCameraAccess, makeObservationSource } from './factory';
export { CameraAccessFixtureProvider, cameraAccessFromFixture } from './cameraFixtures';
export { AppState, ScannerSessionStore } from './session';
export {
  ASPECT_FILL_GRAVITY,
  CameraAuthorizationAll,
  QR_BARCODE_SYMBOLOGY,
  QR_METADATA_OBJECT_TYPE,
  SystemScannerClock,
} from './types';
export type {
  AppTab,
  CameraAccessProviding,
  CameraAccessState,
  CameraAuthorization,
  Point,
  Rect,
  ScannerClock,
  ScannerEngineDecision,
  ScannerEngineID,
  ScannerEngineKind,
  ScannerLifecyclePhase,
  ScannerObservation,
  ScannerObservationSource,
  ScannerPresentation,
  Size,
} from './types';
