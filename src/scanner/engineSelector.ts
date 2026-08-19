import type {
  CameraAuthorization,
  ScannerEngineDecision,
} from './types';

export function decideScannerEngine(
  dataScannerSupported: boolean,
  dataScannerAvailable: boolean,
  authorization: CameraAuthorization,
): ScannerEngineDecision {
  const engine = dataScannerSupported ? 'visionKit' : 'avFoundation';
  const isAuthorized = authorization === 'authorized';
  const startsCapture =
    engine === 'visionKit' ? isAuthorized && dataScannerAvailable : isAuthorized;
  return { engine, startsCapture };
}
