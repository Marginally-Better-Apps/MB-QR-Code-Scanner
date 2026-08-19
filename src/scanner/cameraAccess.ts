import type { CameraAccessState, CameraAuthorization } from './types';

export function resolveCameraAccessState(
  authorization: CameraAuthorization,
  cameraAvailable: boolean,
): CameraAccessState {
  if (!cameraAvailable) {
    return 'hardwareUnavailable';
  }

  switch (authorization) {
    case 'notDetermined':
      return 'notDetermined';
    case 'authorized':
      return 'ready';
    case 'denied':
      return 'denied';
    case 'restricted':
      return 'restricted';
  }
}
