import { NativeEngineObservationSource } from './nativeSource';
import { cameraAccessFromFixture } from './cameraFixtures';
import { makeObservationSource } from './factory';
import { getNativeModule } from './native';
import { AppState, ScannerSessionStore } from './session';
import type { CameraAccessProviding, ScannerObservationSource } from './types';
import { CameraAccessFixtureProvider } from './cameraFixtures';

export type BootstrapResult = {
  appState: AppState;
  engine: 'visionkit' | 'avfoundation' | 'fixture';
  fixturesEnabled: boolean;
};

function argumentValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }
  return undefined;
}

export function bootstrapApp(input?: {
  arguments?: string[];
  defaults?: Record<string, string | undefined>;
  fixturesEnabled?: boolean;
}): BootstrapResult {
  const native = getNativeModule();
  const capabilities = native?.getCapabilities();
  const argv = input?.arguments ?? [];
  const fixturesEnabled =
    input?.fixturesEnabled ?? capabilities?.allowsFixtures ?? false;
  const defaults = {
    cameraFixture: capabilities?.cameraFixture,
    scannerFixture: capabilities?.scannerFixture,
    ...input?.defaults,
  };
  const cameraFixture =
    argumentValue(argv, '--camera-fixture') ?? defaults.cameraFixture;
  const scannerFixture =
    argumentValue(argv, '--scanner-fixture') ?? defaults.scannerFixture;

  const cameraAccess: CameraAccessProviding =
    (fixturesEnabled ? cameraAccessFromFixture(cameraFixture) : null) ??
    (native ? {
      get authorization() {
        return native.getCapabilities().authorization;
      },
      get cameraAvailable() {
        return native.getCapabilities().cameraAvailable;
      },
      async requestAuthorization() {
        await native.requestAuthorization();
      },
      refreshAuthorization() {
        native.refreshAuthorization();
      },
    } : new CameraAccessFixtureProvider({ authorization: 'notDetermined' }));

  let observationSource: ScannerObservationSource;
  let engine: BootstrapResult['engine'];

  if (fixturesEnabled && scannerFixture) {
    observationSource = makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', scannerFixture],
      fixturesEnabled: true,
    });
    engine = 'fixture';
  } else {
    const dataScannerSupported = capabilities?.dataScannerSupported ?? false;
    observationSource = new NativeEngineObservationSource(
      dataScannerSupported ? 'visionkit' : 'avfoundation',
    );
    engine = dataScannerSupported ? 'visionkit' : 'avfoundation';
  }

  const scannerSession = new ScannerSessionStore({
    cameraAccess,
    observationSource,
  });

  return {
    appState: new AppState({ scannerSession }),
    engine,
    fixturesEnabled,
  };
}
