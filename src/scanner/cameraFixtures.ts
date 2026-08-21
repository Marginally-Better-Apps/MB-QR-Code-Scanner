import type { CameraAccessProviding, CameraAuthorization } from './types';

export class CameraAccessFixtureProvider implements CameraAccessProviding {
  authorization: CameraAuthorization;
  readonly cameraAvailable: boolean;
  requestCount = 0;

  private readonly authorizationAfterRequest: CameraAuthorization;
  private readonly authorizationAfterRefresh: CameraAuthorization | undefined;
  private refreshesBeforeRecovery: number;

  constructor(input: {
    authorization: CameraAuthorization;
    cameraAvailable?: boolean;
    authorizationAfterRequest?: CameraAuthorization;
    authorizationAfterRefresh?: CameraAuthorization;
    refreshesBeforeRecovery?: number;
  }) {
    this.authorization = input.authorization;
    this.cameraAvailable = input.cameraAvailable ?? true;
    this.authorizationAfterRequest =
      input.authorizationAfterRequest ?? input.authorization;
    this.authorizationAfterRefresh = input.authorizationAfterRefresh;
    this.refreshesBeforeRecovery = input.refreshesBeforeRecovery ?? 0;
  }

  async requestAuthorization(): Promise<void> {
    this.requestCount += 1;
    this.authorization = this.authorizationAfterRequest;
  }

  refreshAuthorization(): void {
    if (this.refreshesBeforeRecovery > 0) {
      this.refreshesBeforeRecovery -= 1;
      return;
    }

    if (this.authorizationAfterRefresh) {
      this.authorization = this.authorizationAfterRefresh;
    }
  }
}

export function cameraAccessFromFixture(
  fixture: string | undefined,
): CameraAccessProviding | null {
  switch (fixture) {
    case 'not-determined':
      return new CameraAccessFixtureProvider({ authorization: 'notDetermined' });
    case 'authorized':
      return new CameraAccessFixtureProvider({ authorization: 'authorized' });
    case 'denied':
      return new CameraAccessFixtureProvider({ authorization: 'denied' });
    case 'restricted':
      return new CameraAccessFixtureProvider({ authorization: 'restricted' });
    case 'hardware-unavailable':
      return new CameraAccessFixtureProvider({
        authorization: 'notDetermined',
        cameraAvailable: false,
      });
    case 'recovering':
      return new CameraAccessFixtureProvider({
        authorization: 'denied',
        authorizationAfterRefresh: 'authorized',
        refreshesBeforeRecovery: 1,
      });
    default:
      return null;
  }
}
