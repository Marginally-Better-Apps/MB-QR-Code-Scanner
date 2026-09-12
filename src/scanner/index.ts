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
  PAYLOAD_PARSER_VERSION,
  STRUCTURED_PARSERS,
  parseQRPayload,
} from './payloadParser';
export type {
  ParsedQRPayload,
  QRAction,
  QRContent,
  QRSensitivity,
  StructuredParser,
} from './payloadParser';
export { PAYLOAD_FIXTURE_CORPUS } from './payloadFixtures';
export type { PayloadEdgeCategory, PayloadFixture } from './payloadFixtures';
export { dispatchResultAction, defaultResultActionDeps } from './actionRouter';
export type { ResultActionDeps } from './actionRouter';
export { describeResultForDisplay, sanitizeVisibleText } from './webTextPresentation';
export type { ResultViewModel } from './webTextPresentation';
export {
  createInitialScanAcceptanceState,
  normalizeScanPayload,
  SCAN_RESET_MS,
  SCAN_STABLE_MS,
  updateScanAcceptance,
} from './acceptance';
export type {
  AcceptedScan,
  ScanAcceptanceInput,
  ScanAcceptanceResult,
  ScanAcceptanceState,
  ScanAcceptanceTrack,
} from './acceptance';
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
