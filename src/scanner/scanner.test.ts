import {
  AppState,
  ASPECT_FILL_GRAVITY,
  AVFoundationScannerObservationSource,
  CameraAuthorizationAll,
  decideScannerEngine,
  hitTarget,
  makeObservationSource,
  mapObservation,
  normalizedBounds,
  QR_BARCODE_SYMBOLOGY,
  QR_METADATA_OBJECT_TYPE,
  resolveCameraAccessState,
  ScannerObservationFixtureSource,
  ScannerRecognitionRegion,
  ScannerSessionStore,
  videoOrientationForInterface,
  VisionKitScannerObservationSource,
} from '@/scanner';
import { CAMERA_USAGE_DESCRIPTION, CAMERA_USAGE_DESCRIPTION_ES } from '@/constants/privacy';
import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import type {
  AVFoundationRecognizedBarcode,
  AVFoundationScannerConfiguration,
  AVFoundationScannerControlling,
  AVFoundationScannerEventSink,
  AVFoundationScannerPlatform,
} from '@/scanner/avFoundation';
import type {
  VisionKitRecognizedBarcode,
  VisionKitScannerConfiguration,
  VisionKitScannerControlling,
  VisionKitScannerEventSink,
  VisionKitScannerPlatform,
} from '@/scanner/visionKit';
import type { CameraAuthorization, Point, Rect, Size } from '@/scanner/types';
import {
  NativeEngineObservationSource,
  nativeObservationItems,
  publishNativeObservations,
} from '@/scanner/nativeSource';
import appJson from '../../app.json';
import fs from 'fs';
import path from 'path';

class TestScannerClock {
  now: Date;

  constructor(now: Date) {
    this.now = now;
  }
}

class VisionKitScannerPlatformStub implements VisionKitScannerPlatform {
  isSupported: boolean;
  isAvailable: boolean;
  makeControllerCount = 0;
  startScanningCount = 0;
  stopScanningCount = 0;
  isScanning = false;
  viewSize: Size = { width: 100, height: 200 };
  lastConfiguration: VisionKitScannerConfiguration | undefined;
  eventSink: VisionKitScannerEventSink | undefined;

  constructor(isSupported: boolean, isAvailable: boolean) {
    this.isSupported = isSupported;
    this.isAvailable = isAvailable;
  }

  makeController(
    configuration: VisionKitScannerConfiguration,
    eventSink: VisionKitScannerEventSink,
  ): VisionKitScannerControlling {
    this.makeControllerCount += 1;
    this.lastConfiguration = configuration;
    this.eventSink = eventSink;
    const platform = this;
    return {
      get isScanning() {
        return platform.isScanning;
      },
      get viewSize() {
        return platform.viewSize;
      },
      hasPreview: false,
      startScanning() {
        platform.startScanningCount += 1;
        platform.isScanning = true;
      },
      stopScanning() {
        platform.stopScanningCount += 1;
        platform.isScanning = false;
      },
    };
  }
}

class AVFoundationScannerPlatformStub implements AVFoundationScannerPlatform {
  isAuthorized: boolean;
  makeControllerCount = 0;
  startScanningCount = 0;
  stopScanningCount = 0;
  layoutUpdateCount = 0;
  isScanning = false;
  viewSize: Size = { width: 100, height: 200 };
  zoom = 1;
  minZoomFactor = 1;
  maxZoomFactor = 8;
  focusPoint: Point | undefined;
  lastMetadataObjectTypes: string[] | undefined;
  lastConfiguration: AVFoundationScannerConfiguration | undefined;
  eventSink: AVFoundationScannerEventSink | undefined;

  constructor(isAuthorized: boolean) {
    this.isAuthorized = isAuthorized;
  }

  makeController(
    configuration: AVFoundationScannerConfiguration,
    eventSink: AVFoundationScannerEventSink,
  ): AVFoundationScannerControlling {
    this.makeControllerCount += 1;
    this.lastConfiguration = configuration;
    this.lastMetadataObjectTypes = configuration.metadataObjectTypes;
    this.eventSink = eventSink;
    const platform = this;
    return {
      get isScanning() {
        return platform.isScanning;
      },
      get viewSize() {
        return platform.viewSize;
      },
      hasPreview: false,
      get zoomFactor() {
        return platform.zoom;
      },
      get minZoomFactor() {
        return platform.minZoomFactor;
      },
      get maxZoomFactor() {
        return platform.maxZoomFactor;
      },
      startScanning() {
        platform.startScanningCount += 1;
        platform.isScanning = true;
      },
      stopScanning() {
        platform.stopScanningCount += 1;
        platform.isScanning = false;
      },
      setZoomFactor(factor: number) {
        platform.zoom = Math.min(
          platform.maxZoomFactor,
          Math.max(platform.minZoomFactor, factor),
        );
      },
      focus(point: Point) {
        platform.focusPoint = point;
      },
      updatePreviewLayout() {
        platform.layoutUpdateCount += 1;
      },
    };
  }
}

function detection(rawPayload: string) {
  return {
    rawPayload,
    displayBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } satisfies Rect,
  };
}

describe('scanner observation protocol', () => {
  test('fixture source emits engine-neutral observation using injected clock', () => {
    const timestamp = new Date(1_728_000_000 * 1000);
    const clock = new TestScannerClock(timestamp);
    const source = new ScannerObservationFixtureSource({
      engineID: 'fixture.unit',
      clock,
    });
    const receivedFrames: { rawPayload: string; displayBounds: Rect; timestamp: Date; engineID: string }[][] = [];

    source.start((frame) => receivedFrames.push(frame));
    source.emit([
      {
        rawPayload: 'https://example.com/one',
        displayBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    ]);

    expect(receivedFrames).toEqual([
      [
        {
          rawPayload: 'https://example.com/one',
          displayBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          timestamp,
          engineID: 'fixture.unit',
        },
      ],
    ]);
  });

  test('scanner session consumes observation protocol frames', async () => {
    const source = new ScannerObservationFixtureSource({
      engineID: 'fixture.session',
      clock: new TestScannerClock(new Date(1_728_000_100 * 1000)),
    });
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });

    await session.activateScanner();
    source.emit([
      {
        rawPayload: 'replacement',
        displayBounds: { x: 0.4, y: 0.3, width: 0.2, height: 0.2 },
      },
    ]);

    expect(session.visibleObservations.map((item) => item.rawPayload)).toEqual([
      'replacement',
    ]);

    source.emit([]);
    expect(session.visibleObservations).toEqual([]);
  });

  test('named launch fixture emits its deterministic observation', () => {
    const timestamp = new Date(1_728_000_200 * 1000);
    const source = makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', 'single-code'],
      fixturesEnabled: true,
      clock: new TestScannerClock(timestamp),
    });
    const receivedFrames: { rawPayload: string; timestamp: Date }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    expect(source.engineID).toBe('fixture.single-code');
    expect(receivedFrames).toHaveLength(1);
    expect(receivedFrames[0].map((item) => item.rawPayload)).toEqual([
      'https://example.com/fixture',
    ]);
    expect(receivedFrames[0].map((item) => item.timestamp)).toEqual([timestamp]);
  });

  test('fixture source deterministically emits loss, repeat, replacement, and simultaneous codes', () => {
    const clock = new TestScannerClock(new Date(10 * 1000));
    const engineID = 'fixture.sequence';
    const source = new ScannerObservationFixtureSource({ engineID, clock });
    const receivedFrames: { rawPayload: string; timestamp: Date; engineID: string }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    source.emit([detection('first')]);
    clock.now = new Date(11 * 1000);
    source.emit([]);
    clock.now = new Date(12 * 1000);
    source.emit([detection('first')]);
    clock.now = new Date(13 * 1000);
    source.emit([detection('replacement')]);
    clock.now = new Date(14 * 1000);
    source.emit([detection('left'), detection('right')]);

    expect(receivedFrames.map((frame) => frame.map((item) => item.rawPayload))).toEqual([
      ['first'],
      [],
      ['first'],
      ['replacement'],
      ['left', 'right'],
    ]);
    expect(receivedFrames.flatMap((frame) => frame.map((item) => item.timestamp))).toEqual(
      [10, 12, 13, 14, 14].map((value) => new Date(value * 1000)),
    );
    expect(receivedFrames.flat().every((item) => item.engineID === engineID)).toBe(true);
  });

  test('fixture mode is ignored when the build does not allow fixtures', () => {
    const source = makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', 'single-code'],
      defaults: { scannerFixture: 'single-code' },
      fixturesEnabled: false,
      dataScannerSupported: true,
    });
    const receivedFrames: unknown[] = [];
    source.start((frame) => receivedFrames.push(frame));

    expect(source.engineID).toBe('visionkit');
    expect(receivedFrames).toEqual([]);
  });
});

describe('privacy and liquid glass policy', () => {
  test('camera purpose string promises on-device recognition without retention', () => {
    expect(appJson.expo.ios.infoPlist.NSCameraUsageDescription).toBe(
      CAMERA_USAGE_DESCRIPTION,
    );
  });

  test('Info.plist does not opt out of system Liquid Glass', () => {
    const infoPlist = appJson.expo.ios.infoPlist as Record<string, unknown>;
    expect(infoPlist.UIDesignRequiresCompatibility).not.toBe(true);
  });

  test('camera purpose string is localized in Spanish', () => {
    const stringsPath = path.join(
      __dirname,
      '../../locales/es/InfoPlist.strings',
    );
    const contents = fs.readFileSync(stringsPath, 'utf8');
    expect(contents).toContain(CAMERA_USAGE_DESCRIPTION_ES);
  });
});

describe('camera access and app shell', () => {
  test('camera access state maps every authorization and hardware state', () => {
    expect(resolveCameraAccessState('notDetermined', true)).toBe('notDetermined');
    expect(resolveCameraAccessState('authorized', true)).toBe('ready');
    expect(resolveCameraAccessState('denied', true)).toBe('denied');
    expect(resolveCameraAccessState('restricted', true)).toBe('restricted');

    for (const authorization of CameraAuthorizationAll) {
      expect(resolveCameraAccessState(authorization, false)).toBe(
        'hardwareUnavailable',
      );
    }
  });

  test('activating the scanner requests undetermined authorization in scanner context', async () => {
    const cameraAccess = new CameraAccessFixtureProvider({
      authorization: 'notDetermined',
      authorizationAfterRequest: 'authorized',
    });
    const session = new ScannerSessionStore({
      cameraAccess,
      observationSource: new ScannerObservationFixtureSource({
        engineID: 'fixture.session',
      }),
    });

    expect(session.cameraAccessState).toBe('notDetermined');
    await session.activateScanner();
    expect(cameraAccess.requestCount).toBe(1);
    expect(session.cameraAccessState).toBe('ready');
    expect(session.isCameraActive).toBe(true);
    expect(session.revision).toBeGreaterThan(0);
  });

  test('returning from Settings rechecks access and activates the camera', () => {
    const cameraAccess = new CameraAccessFixtureProvider({
      authorization: 'denied',
    });
    const session = new ScannerSessionStore({
      cameraAccess,
      observationSource: new ScannerObservationFixtureSource({
        engineID: 'fixture.session',
      }),
    });

    expect(session.cameraAccessState).toBe('denied');
    expect(session.isCameraActive).toBe(false);

    cameraAccess.authorization = 'authorized';
    session.resumeFromSettings();

    expect(session.cameraAccessState).toBe('ready');
    expect(session.isCameraActive).toBe(true);
  });

  test('cold launch selects Scanner', () => {
    expect(new AppState().selectedTab).toBe('scanner');
  });

  test('switching tabs preserves the scanner session', () => {
    const appState = new AppState();
    const originalSession = appState.scannerSession;
    appState.selectedTab = 'history';
    expect(appState.scannerSession).toBe(originalSession);
    appState.selectedTab = 'scanner';
    expect(appState.scannerSession).toBe(originalSession);
  });
});

describe('engine selection', () => {
  test('factory selects VisionKit when no fixture is requested', () => {
    const source = makeObservationSource({
      arguments: ['QRScanner'],
      fixturesEnabled: true,
      dataScannerSupported: true,
    });
    expect(source.engineID).toBe('visionkit');
  });

  test('engine selection uses fallback only when Data Scanner hardware is unsupported', () => {
    expect(
      decideScannerEngine(true, true, 'authorized'),
    ).toEqual({ engine: 'visionKit', startsCapture: true });
    expect(
      decideScannerEngine(true, false, 'authorized'),
    ).toEqual({ engine: 'visionKit', startsCapture: false });
    expect(
      decideScannerEngine(false, false, 'authorized'),
    ).toEqual({ engine: 'avFoundation', startsCapture: true });
    expect(
      decideScannerEngine(false, false, 'denied'),
    ).toEqual({ engine: 'avFoundation', startsCapture: false });
    expect(
      decideScannerEngine(false, false, 'restricted'),
    ).toEqual({ engine: 'avFoundation', startsCapture: false });
    expect(
      decideScannerEngine(true, true, 'denied'),
    ).toEqual({ engine: 'visionKit', startsCapture: false });
  });

  test('factory selects AVFoundation fallback when Data Scanner is unsupported', () => {
    const source = makeObservationSource({
      arguments: ['QRScanner'],
      fixturesEnabled: true,
      dataScannerSupported: false,
    });
    expect(source.engineID).toBe('avfoundation');
  });
});

describe('VisionKit engine', () => {
  test('does not construct a controller until supported and available', () => {
    const unavailable = new VisionKitScannerPlatformStub(true, false);
    const unsupported = new VisionKitScannerPlatformStub(false, true);
    const available = new VisionKitScannerPlatformStub(true, true);

    new VisionKitScannerObservationSource(
      unavailable,
      new TestScannerClock(new Date(0)),
    ).start(() => {});
    new VisionKitScannerObservationSource(
      unsupported,
      new TestScannerClock(new Date(0)),
    ).start(() => {});

    expect(unavailable.makeControllerCount).toBe(0);
    expect(unsupported.makeControllerCount).toBe(0);
    expect(unavailable.startScanningCount).toBe(0);
    expect(unsupported.startScanningCount).toBe(0);

    new VisionKitScannerObservationSource(
      available,
      new TestScannerClock(new Date(0)),
    ).start(() => {});

    expect(available.makeControllerCount).toBe(1);
    expect(available.startScanningCount).toBe(1);
  });

  test('requests QR-only, multiple items, and product-owned feedback', () => {
    const platform = new VisionKitScannerPlatformStub(true, true);
    const source = new VisionKitScannerObservationSource(
      platform,
      new TestScannerClock(new Date(0)),
    );
    source.start(() => {});

    expect(platform.lastConfiguration).toEqual({
      barcodeSymbologies: [QR_BARCODE_SYMBOLOGY],
      recognizesMultipleItems: true,
      isHighFrameRateTrackingEnabled: true,
      isGuidanceEnabled: false,
      isHighlightingEnabled: false,
      recognitionRegion: ScannerRecognitionRegion.fullPreview,
    });
  });

  test('translates add, update, and remove into normalized observations', () => {
    const timestamp = new Date(1_728_000_300 * 1000);
    const platform = new VisionKitScannerPlatformStub(true, true);
    platform.viewSize = { width: 100, height: 200 };
    const source = new VisionKitScannerObservationSource(
      platform,
      new TestScannerClock(timestamp),
    );
    const receivedFrames: { rawPayload: string; displayBounds: Rect }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    const first: VisionKitRecognizedBarcode = {
      payload: 'https://example.com/one',
      bounds: { x: 10, y: 40, width: 50, height: 20 },
    };
    const second: VisionKitRecognizedBarcode = {
      payload: 'https://example.com/two',
      bounds: { x: 20, y: 80, width: 40, height: 40 },
    };
    const missingPayload: VisionKitRecognizedBarcode = {
      payload: null,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };

    platform.eventSink?.visionKitScannerDidAdd([first], [first, missingPayload]);
    platform.eventSink?.visionKitScannerDidUpdate([first], [first, second]);
    platform.eventSink?.visionKitScannerDidRemove([first], [second]);
    platform.eventSink?.visionKitScannerDidRemove([second], []);

    expect(receivedFrames.map((frame) => frame.map((item) => item.rawPayload))).toEqual([
      ['https://example.com/one'],
      ['https://example.com/one', 'https://example.com/two'],
      ['https://example.com/two'],
      [],
    ]);
    expect(receivedFrames[0][0].displayBounds).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.1,
    });
    expect(receivedFrames[1][1].displayBounds).toEqual({
      x: 0.2,
      y: 0.4,
      width: 0.4,
      height: 0.2,
    });
    expect(receivedFrames.flat().every((item) => item.engineID === source.engineID)).toBe(
      true,
    );
    expect(receivedFrames.flat().every((item) => item.timestamp === timestamp)).toBe(true);
  });

  test('start, stop, and scene transitions are idempotent', () => {
    const platform = new VisionKitScannerPlatformStub(true, true);
    const source = new VisionKitScannerObservationSource(
      platform,
      new TestScannerClock(new Date(20 * 1000)),
    );
    const receivedFrames: unknown[] = [];
    source.start((frame) => receivedFrames.push(frame));
    source.start((frame) => receivedFrames.push(frame));

    expect(platform.makeControllerCount).toBe(1);
    expect(platform.startScanningCount).toBe(1);

    const once: VisionKitRecognizedBarcode = {
      payload: 'once',
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };
    platform.eventSink?.visionKitScannerDidAdd([once], [once]);
    expect(receivedFrames).toHaveLength(1);

    source.handleLifecycle('background');
    source.handleLifecycle('background');
    expect(platform.stopScanningCount).toBe(1);
    expect(platform.startScanningCount).toBe(1);

    const ignored: VisionKitRecognizedBarcode = {
      payload: 'ignored',
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };
    platform.eventSink?.visionKitScannerDidUpdate([ignored], [ignored]);
    expect(receivedFrames).toHaveLength(1);

    source.handleLifecycle('active');
    source.handleLifecycle('active');
    expect(platform.startScanningCount).toBe(2);
    expect(platform.makeControllerCount).toBe(1);
    expect(receivedFrames).toHaveLength(1);

    source.stop();
    source.stop();
    expect(platform.stopScanningCount).toBe(2);

    const afterStop: VisionKitRecognizedBarcode = {
      payload: 'after-stop',
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };
    platform.eventSink?.visionKitScannerDidAdd([afterStop], [afterStop]);
    expect(receivedFrames).toHaveLength(1);
  });

  test('scanner session stops and restarts the engine across scene transitions', async () => {
    const platform = new VisionKitScannerPlatformStub(true, true);
    const source = new VisionKitScannerObservationSource(
      platform,
      new TestScannerClock(new Date(30 * 1000)),
    );
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });

    await session.activateScanner();
    expect(platform.startScanningCount).toBe(1);

    session.handleLifecycle('background');
    expect(platform.stopScanningCount).toBe(1);
    expect(platform.startScanningCount).toBe(1);

    session.handleLifecycle('active');
    expect(platform.startScanningCount).toBe(2);
    expect(platform.makeControllerCount).toBe(1);
  });
});

describe('AVFoundation engine', () => {
  test('requests QR-only metadata and can report multiple codes', () => {
    const timestamp = new Date(1_728_000_400 * 1000);
    const platform = new AVFoundationScannerPlatformStub(true);
    platform.viewSize = { width: 100, height: 200 };
    const source = new AVFoundationScannerObservationSource(
      platform,
      new TestScannerClock(timestamp),
    );
    const receivedFrames: { rawPayload: string; displayBounds: Rect }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    expect(platform.lastMetadataObjectTypes).toEqual([QR_METADATA_OBJECT_TYPE]);
    expect(source.engineID).toBe('avfoundation');

    const first: AVFoundationRecognizedBarcode = {
      payload: 'https://example.com/one',
      bounds: { x: 10, y: 40, width: 50, height: 20 },
    };
    const second: AVFoundationRecognizedBarcode = {
      payload: 'https://example.com/two',
      bounds: { x: 20, y: 80, width: 40, height: 20 },
    };
    const missingPayload: AVFoundationRecognizedBarcode = {
      payload: null,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    };

    platform.eventSink?.avFoundationScannerDidOutput([first, missingPayload]);
    platform.eventSink?.avFoundationScannerDidOutput([first, second]);
    platform.eventSink?.avFoundationScannerDidOutput([]);

    expect(receivedFrames.map((frame) => frame.map((item) => item.rawPayload))).toEqual([
      ['https://example.com/one'],
      ['https://example.com/one', 'https://example.com/two'],
      [],
    ]);
    expect(receivedFrames[0][0].displayBounds).toEqual(
      normalizedBounds({ x: 10, y: 40, width: 50, height: 20 }, { width: 100, height: 200 }),
    );
    expect(receivedFrames[1][1].displayBounds).toEqual(
      normalizedBounds({ x: 20, y: 80, width: 40, height: 20 }, { width: 100, height: 200 }),
    );
    expect(receivedFrames.flat().every((item) => item.engineID === source.engineID)).toBe(
      true,
    );
    expect(receivedFrames.flat().every((item) => item.timestamp === timestamp)).toBe(true);
  });

  test('denied and restricted permission never start AVFoundation capture', () => {
    const denied = new AVFoundationScannerPlatformStub(false);
    new AVFoundationScannerObservationSource(
      denied,
      new TestScannerClock(new Date(0)),
    ).start(() => {});
    expect(denied.makeControllerCount).toBe(0);
    expect(denied.startScanningCount).toBe(0);

    const restricted = new AVFoundationScannerPlatformStub(false);
    new AVFoundationScannerObservationSource(
      restricted,
      new TestScannerClock(new Date(0)),
    ).start(() => {});
    expect(restricted.makeControllerCount).toBe(0);
    expect(restricted.startScanningCount).toBe(0);
  });

  test('factory does not start fallback capture when permission is denied or restricted', () => {
    for (const authorization of ['denied', 'restricted'] as CameraAuthorization[]) {
      const source = makeObservationSource({
        arguments: ['QRScanner'],
        fixturesEnabled: true,
        dataScannerSupported: false,
        authorization,
      });
      const receivedFrames: unknown[] = [];
      source.start((frame) => receivedFrames.push(frame));
      expect(source.engineID).toBe('avfoundation');
      expect(receivedFrames).toEqual([]);
      expect(source.hasPreview).toBe(false);
    }
  });
});

describe('full-frame scan, focus, and zoom', () => {
  test('recognition region is the full preview and not a center crop', () => {
    const centerGuide = { x: 0.25, y: 0.35, width: 0.5, height: 0.3 };
    const edgeBounds = [
      { x: 0.01, y: 0.4, width: 0.12, height: 0.12 },
      { x: 0.87, y: 0.4, width: 0.12, height: 0.12 },
      { x: 0.44, y: 0.01, width: 0.12, height: 0.12 },
      { x: 0.44, y: 0.87, width: 0.12, height: 0.12 },
    ];

    expect(ScannerRecognitionRegion.fullPreview).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(VisionKitScannerObservationSource.productConfiguration.recognitionRegion).toEqual(
      ScannerRecognitionRegion.fullPreview,
    );
    expect(
      AVFoundationScannerObservationSource.productConfiguration.recognitionRegion,
    ).toEqual(ScannerRecognitionRegion.fullPreview);
    expect(AVFoundationScannerObservationSource.productConfiguration.videoGravity).toBe(
      ASPECT_FILL_GRAVITY,
    );

    for (const bounds of edgeBounds) {
      expect(
        bounds.x < centerGuide.x + centerGuide.width &&
          bounds.x + bounds.width > centerGuide.x &&
          bounds.y < centerGuide.y + centerGuide.height &&
          bounds.y + bounds.height > centerGuide.y,
      ).toBe(false);
      expect(ScannerRecognitionRegion.containsVisibleCode(bounds)).toBe(true);
    }
  });

  test('AVFoundation engine publishes codes near each preview edge', () => {
    const timestamp = new Date(1_728_000_500 * 1000);
    const platform = new AVFoundationScannerPlatformStub(true);
    platform.viewSize = { width: 100, height: 200 };
    const source = new AVFoundationScannerObservationSource(
      platform,
      new TestScannerClock(timestamp),
    );
    const receivedFrames: { rawPayload: string; displayBounds: Rect }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    expect(platform.lastConfiguration?.recognitionRegion).toEqual(
      ScannerRecognitionRegion.fullPreview,
    );
    expect(platform.lastConfiguration?.videoGravity).toBe(ASPECT_FILL_GRAVITY);

    const edges: [string, Rect][] = [
      ['edge-left', { x: 1, y: 90, width: 12, height: 12 }],
      ['edge-right', { x: 87, y: 90, width: 12, height: 12 }],
      ['edge-top', { x: 44, y: 1, width: 12, height: 12 }],
      ['edge-bottom', { x: 44, y: 187, width: 12, height: 12 }],
    ];

    platform.eventSink?.avFoundationScannerDidOutput(
      edges.map(([payload, bounds]) => ({ payload, bounds })),
    );

    const frame = receivedFrames.at(-1);
    expect(frame?.map((item) => item.rawPayload)).toEqual(edges.map(([payload]) => payload));
    expect(frame?.map((item) => item.displayBounds)).toEqual([
      { x: 0.01, y: 0.45, width: 0.12, height: 0.06 },
      { x: 0.87, y: 0.45, width: 0.12, height: 0.06 },
      { x: 0.44, y: 0.005, width: 0.12, height: 0.06 },
      { x: 0.44, y: 0.935, width: 0.12, height: 0.06 },
    ]);
    expect(frame?.every((item) => ScannerRecognitionRegion.containsVisibleCode(item.displayBounds))).toBe(
      true,
    );
  });

  test('observation bounds stay aligned in portrait, landscape, and after resize', () => {
    const portrait = { width: 390, height: 844 };
    const landscape = { width: 844, height: 390 };
    const resized = { width: 200, height: 400 };
    const layerBounds = { x: 12, y: 80, width: 90, height: 90 };

    const portraitMapped = normalizedBounds(layerBounds, portrait);
    const landscapeMapped = normalizedBounds(layerBounds, landscape);
    const resizedMapped = normalizedBounds(layerBounds, resized);

    expect(portraitMapped.x).toBeCloseTo(12 / 390, 4);
    expect(portraitMapped.y).toBeCloseTo(80 / 844, 4);
    expect(landscapeMapped.x).toBeCloseTo(12 / 844, 4);
    expect(landscapeMapped.y).toBeCloseTo(80 / 390, 4);
    expect(resizedMapped.width).toBeCloseTo(90 / 200, 4);
    expect(resizedMapped.height).toBeCloseTo(90 / 400, 4);

    expect(videoOrientationForInterface('portrait')).toBe('portrait');
    expect(videoOrientationForInterface('landscapeLeft')).toBe('landscapeLeft');
    expect(videoOrientationForInterface('landscapeRight')).toBe('landscapeRight');

    const platform = new AVFoundationScannerPlatformStub(true);
    platform.viewSize = portrait;
    const source = new AVFoundationScannerObservationSource(
      platform,
      new TestScannerClock(new Date(40 * 1000)),
    );
    const receivedFrames: { displayBounds: Rect }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    platform.eventSink?.avFoundationScannerDidOutput([
      { payload: 'aligned', bounds: layerBounds },
    ]);
    platform.viewSize = landscape;
    source.handlePreviewLayoutChange();
    platform.eventSink?.avFoundationScannerDidOutput([
      { payload: 'aligned', bounds: layerBounds },
    ]);
    platform.viewSize = resized;
    source.handlePreviewLayoutChange();
    platform.eventSink?.avFoundationScannerDidOutput([
      { payload: 'aligned', bounds: layerBounds },
    ]);

    expect(platform.layoutUpdateCount).toBe(2);
    expect(receivedFrames.map((frame) => frame.map((item) => item.displayBounds))).toEqual([
      [portraitMapped],
      [landscapeMapped],
      [resizedMapped],
    ]);
  });

  test('pinch zoom and tap focus do not trigger result actions', () => {
    const platform = new AVFoundationScannerPlatformStub(true);
    const source = new AVFoundationScannerObservationSource(
      platform,
      new TestScannerClock(new Date(0)),
    );
    source.start(() => {});

    const resultTray = { x: 0, y: 0.72, width: 1, height: 0.28 };
    expect(hitTarget({ x: 0.5, y: 0.4 }, resultTray)).toBe('camera');
    expect(hitTarget({ x: 0.5, y: 0.85 }, resultTray)).toBe('resultAction');

    let resultActionCount = 0;
    source.beginPinchZoom();
    source.updatePinchZoom(2, { x: 0.5, y: 0.4 }, resultTray, () => {
      resultActionCount += 1;
    });
    source.focus({ x: 0.2, y: 0.3 }, resultTray, () => {
      resultActionCount += 1;
    });
    source.focus({ x: 0.5, y: 0.85 }, resultTray, () => {
      resultActionCount += 1;
    });

    expect(resultActionCount).toBe(1);
    expect(platform.zoom).toBe(2);
    expect(platform.focusPoint).toEqual({ x: 0.2, y: 0.3 });
    expect(source.usesCustomCameraGestures).toBe(true);
    expect(
      new VisionKitScannerObservationSource(
        new VisionKitScannerPlatformStub(true, true),
        new TestScannerClock(new Date(0)),
      ).usesCustomCameraGestures,
    ).toBe(false);
  });

  test('scanning pauses when scanner is obscured or scene is inactive and resumes once', async () => {
    const platform = new AVFoundationScannerPlatformStub(true);
    const source = new AVFoundationScannerObservationSource(
      platform,
      new TestScannerClock(new Date(50 * 1000)),
    );
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });

    await session.activateScanner();
    expect(platform.startScanningCount).toBe(1);

    session.handlePresentation('obscured');
    session.handlePresentation('obscured');
    expect(platform.stopScanningCount).toBe(1);
    expect(platform.startScanningCount).toBe(1);

    platform.eventSink?.avFoundationScannerDidOutput([
      {
        payload: 'ignored-while-obscured',
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
    ]);
    expect(session.visibleObservations).toEqual([]);

    session.handlePresentation('visible');
    session.handlePresentation('visible');
    expect(platform.startScanningCount).toBe(2);
    expect(platform.makeControllerCount).toBe(1);
    expect(platform.stopScanningCount).toBe(1);

    session.handleLifecycle('inactive');
    session.handleLifecycle('inactive');
    expect(platform.stopScanningCount).toBe(2);

    session.handleLifecycle('active');
    session.handleLifecycle('active');
    expect(platform.startScanningCount).toBe(3);
    expect(platform.stopScanningCount).toBe(2);
  });

  test('coordinate mapping does not require the main thread', () => {
    const bounds = { x: 10, y: 20, width: 30, height: 40 };
    const viewSize = { width: 100, height: 200 };
    const mapped = mapObservation({
      payload: 'off-main',
      bounds,
      viewSize,
      timestamp: new Date(1000),
      engineID: 'avfoundation',
    });
    expect(mapped?.displayBounds).toEqual(normalizedBounds(bounds, viewSize));
  });

  test('named edge fixture emits a code near each preview edge', () => {
    const timestamp = new Date(1_728_000_600 * 1000);
    const source = makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', 'edge-codes'],
      fixturesEnabled: true,
      clock: new TestScannerClock(timestamp),
    });
    const receivedFrames: { rawPayload: string; displayBounds: Rect }[][] = [];
    source.start((frame) => receivedFrames.push(frame));

    expect(source.engineID).toBe('fixture.edge-codes');
    const frame = receivedFrames[0];
    expect(frame.map((item) => item.rawPayload)).toEqual([
      'https://example.com/edge-left',
      'https://example.com/edge-right',
      'https://example.com/edge-top',
      'https://example.com/edge-bottom',
    ]);
    expect(
      frame.every((item) => ScannerRecognitionRegion.containsVisibleCode(item.displayBounds)),
    ).toBe(true);
    const centerGuide = { x: 0.25, y: 0.35, width: 0.5, height: 0.3 };
    expect(
      frame.some(
        (item) =>
          item.displayBounds.x < centerGuide.x + centerGuide.width &&
          item.displayBounds.x + item.displayBounds.width > centerGuide.x &&
          item.displayBounds.y < centerGuide.y + centerGuide.height &&
          item.displayBounds.y + item.displayBounds.height > centerGuide.y,
      ),
    ).toBe(false);
  });
});

describe('native observation bridge', () => {
  test('parses Expo view events with or without nativeEvent wrapping', () => {
    const item = {
      payload: 'https://survey.example/qr',
      displayBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    };
    expect(nativeObservationItems({ nativeEvent: { items: [item] } })).toEqual([item]);
    expect(nativeObservationItems({ items: [item] })).toEqual([item]);
    expect(nativeObservationItems({})).toEqual([]);
    expect(nativeObservationItems(null)).toEqual([]);
  });

  test('native engine treats the camera view as the preview and publishes detections', async () => {
    const source = new NativeEngineObservationSource('visionkit');
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });

    expect(source.hasPreview).toBe(true);
    await session.activateScanner();
    expect(session.hasPreview).toBe(true);

    publishNativeObservations('visionkit', [
      {
        payload: 'https://survey.walmart.com/logo-qr',
        displayBounds: { x: 0.18, y: 0.22, width: 0.31, height: 0.2 },
      },
    ]);

    expect(session.visibleObservations.map((item) => item.rawPayload)).toEqual([
      'https://survey.walmart.com/logo-qr',
    ]);
    expect(session.visibleObservations[0].displayBounds).toEqual({
      x: 0.18,
      y: 0.22,
      width: 0.31,
      height: 0.2,
    });
  });
});
