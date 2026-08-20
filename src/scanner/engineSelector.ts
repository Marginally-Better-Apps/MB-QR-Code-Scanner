import type {
  CameraAuthorization,
  ScannerEngineDecision,
} from './types';

export function decideScannerEngine(
  _dataScannerSupported: boolean,
  _dataScannerAvailable: boolean,
  authorization: CameraAuthorization,
): ScannerEngineDecision {
  const engine = 'avFoundation';
  const isAuthorized = authorization === 'authorized';
  const startsCapture = isAuthorized;
  return { engine, startsCapture };
}
