import type {
  CameraAuthorization,
  ScannerEngineDecision,
} from './types';

export function decideScannerEngine(
  dataScannerSupported: boolean,
  dataScannerAvailable: boolean,
  authorization: CameraAuthorization,
): ScannerEngineDecision {
  const engine =
    dataScannerSupported && dataScannerAvailable
      ? 'visionKit'
      : 'avFoundation';
  const isAuthorized = authorization === 'authorized';
  const startsCapture = isAuthorized;
  return { engine, startsCapture };
}
