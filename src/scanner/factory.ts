import { AVFoundationScannerObservationSource } from './avFoundation';
import type { AVFoundationScannerPlatform } from './avFoundation';
import { cameraAccessFromFixture } from './cameraFixtures';
import { decideScannerEngine } from './engineSelector';
import {
  EDGE_CODE_FIXTURE,
  ScannerObservationFixtureSource,
  SINGLE_CODE_FIXTURE,
} from './fixtures';
import type {
  CameraAccessProviding,
  CameraAuthorization,
  ScannerClock,
  ScannerObservationSource,
} from './types';
import { SystemScannerClock } from './types';
import { VisionKitScannerObservationSource } from './visionKit';
import type { VisionKitScannerPlatform } from './visionKit';

export type LaunchConfiguration = {
  arguments?: string[];
  defaults?: Record<string, string | undefined>;
  fixturesEnabled?: boolean;
  clock?: ScannerClock;
  dataScannerSupported?: boolean;
  dataScannerAvailable?: boolean;
  authorization?: CameraAuthorization;
  visionKitPlatform?: VisionKitScannerPlatform;
  avFoundationPlatform?: AVFoundationScannerPlatform;
};

function argumentValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }
  return undefined;
}

export function makeObservationSource(
  input: LaunchConfiguration = {},
): ScannerObservationSource {
  const argv = input.arguments ?? [];
  const fixturesEnabled = input.fixturesEnabled ?? false;
  const clock = input.clock ?? SystemScannerClock;
  const dataScannerSupported = input.dataScannerSupported ?? true;
  const scannerFixture =
    argumentValue(argv, '--scanner-fixture') ?? input.defaults?.scannerFixture;

  if (fixturesEnabled && scannerFixture) {
    switch (scannerFixture) {
      case 'single-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.single-code',
          clock,
          startupFrame: SINGLE_CODE_FIXTURE,
        });
      case 'edge-codes':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.edge-codes',
          clock,
          startupFrame: EDGE_CODE_FIXTURE,
        });
      default:
        break;
    }
  }

  const authorization = input.authorization ?? 'authorized';
  const engine = decideScannerEngine(
    dataScannerSupported,
    input.dataScannerAvailable ?? true,
    authorization,
  ).engine;

  if (engine === 'visionKit') {
    return new VisionKitScannerObservationSource(input.visionKitPlatform, clock);
  }

  const platform: AVFoundationScannerPlatform =
    input.avFoundationPlatform ??
    ({
      isAuthorized: authorization === 'authorized',
      makeController() {
        throw new Error('AVFoundation platform is not available');
      },
    } satisfies AVFoundationScannerPlatform);

  return new AVFoundationScannerObservationSource(platform, clock);
}

export function makeCameraAccess(
  input: LaunchConfiguration = {},
): CameraAccessProviding | null {
  const argv = input.arguments ?? [];
  const fixture =
    argumentValue(argv, '--camera-fixture') ?? input.defaults?.cameraFixture;
  if (!(input.fixturesEnabled ?? false)) {
    return null;
  }
  return cameraAccessFromFixture(fixture);
}
