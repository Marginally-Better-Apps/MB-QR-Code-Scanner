import { AVFoundationScannerObservationSource } from './avFoundation';
import type { AVFoundationScannerPlatform } from './avFoundation';
import { cameraAccessFromFixture } from './cameraFixtures';
import { decideScannerEngine } from './engineSelector';
import {
  EDGE_CODE_FIXTURE,
  CALENDAR_CODE_FIXTURE,
  CONTACT_CODE_FIXTURE,
  WIFI_CODE_FIXTURE,
  EMAIL_CODE_FIXTURE,
  GEO_CODE_FIXTURE,
  PHONE_CODE_FIXTURE,
  ScannerObservationFixtureSource,
  SINGLE_CODE_FIXTURE,
  SMS_CODE_FIXTURE,
  THREE_CODE_FIXTURE,
  TWO_CODE_FIXTURE,
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
          stabilizeStartup: true,
        });
      case 'edge-codes':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.edge-codes',
          clock,
          startupFrame: EDGE_CODE_FIXTURE,
        });
      case 'two-codes':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.two-codes',
          clock,
          startupFrame: TWO_CODE_FIXTURE,
        });
      case 'three-codes':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.three-codes',
          clock,
          startupFrame: THREE_CODE_FIXTURE,
        });
      case 'email-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.email-code',
          clock,
          startupFrame: EMAIL_CODE_FIXTURE,
        });
      case 'phone-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.phone-code',
          clock,
          startupFrame: PHONE_CODE_FIXTURE,
        });
      case 'sms-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.sms-code',
          clock,
          startupFrame: SMS_CODE_FIXTURE,
        });
      case 'geo-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.geo-code',
          clock,
          startupFrame: GEO_CODE_FIXTURE,
        });
      case 'contact-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.contact-code',
          clock,
          startupFrame: CONTACT_CODE_FIXTURE,
        });
      case 'calendar-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.calendar-code',
          clock,
          startupFrame: CALENDAR_CODE_FIXTURE,
        });
      case 'wifi-code':
        return new ScannerObservationFixtureSource({
          engineID: 'fixture.wifi-code',
          clock,
          startupFrame: WIFI_CODE_FIXTURE,
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
