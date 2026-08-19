export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type CameraAuthorization =
  | 'notDetermined'
  | 'authorized'
  | 'denied'
  | 'restricted';

export const CameraAuthorizationAll: CameraAuthorization[] = [
  'notDetermined',
  'authorized',
  'denied',
  'restricted',
];

export type CameraAccessState =
  | 'notDetermined'
  | 'ready'
  | 'denied'
  | 'restricted'
  | 'hardwareUnavailable';

export type ScannerEngineID = string;

export type ScannerObservation = {
  rawPayload: string;
  displayBounds: Rect;
  timestamp: Date;
  engineID: ScannerEngineID;
};

export type ScannerClock = {
  now: Date;
};

export const SystemScannerClock: ScannerClock = {
  get now() {
    return new Date();
  },
};

export type ScannerLifecyclePhase = 'active' | 'inactive' | 'background';
export type ScannerPresentation = 'visible' | 'obscured';
export type AppTab = 'scanner' | 'history';
export type ScannerEngineKind = 'visionKit' | 'avFoundation';

export type ScannerEngineDecision = {
  engine: ScannerEngineKind;
  startsCapture: boolean;
};

export type ScannerObservationSource = {
  engineID: ScannerEngineID;
  hasPreview: boolean;
  start(receiveFrame: (frame: ScannerObservation[]) => void): void;
  stop(): void;
  handleLifecycle(phase: ScannerLifecyclePhase): void;
};

export type CameraAccessProviding = {
  authorization: CameraAuthorization;
  cameraAvailable: boolean;
  requestAuthorization(): Promise<void>;
  refreshAuthorization(): void;
};

export const QR_BARCODE_SYMBOLOGY = 'QR';
export const QR_METADATA_OBJECT_TYPE = 'org.iso.QRCode';
export const ASPECT_FILL_GRAVITY = 'AVLayerVideoGravityResizeAspectFill';
