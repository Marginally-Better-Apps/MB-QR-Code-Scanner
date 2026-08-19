import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HistoryScreen } from '@/components/HistoryScreen';
import { ScannerScreen } from '@/components/ScannerScreen';
import { setLocale } from '@/i18n';
import { ScannerSessionStore } from '@/scanner';
import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { makeObservationSource } from '@/scanner/factory';
import { ScannerObservationFixtureSource } from '@/scanner/fixtures';
import {
  NativeEngineObservationSource,
  publishNativeObservations,
} from '@/scanner/nativeSource';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => {}),
}));

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children }: { children: unknown }) => children,
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));

jest.mock('@/components/ScannerPreview', () => ({
  ScannerPreview: () => null,
}));

function session(cameraFixture: string, scannerFixture?: string) {
  const cameraAccess = new CameraAccessFixtureProvider(
    cameraFixture === 'not-determined'
      ? { authorization: 'notDetermined' }
      : cameraFixture === 'denied' || cameraFixture === 'recovering'
        ? { authorization: 'denied' }
        : cameraFixture === 'restricted'
          ? { authorization: 'restricted' }
          : cameraFixture === 'hardware-unavailable'
            ? { authorization: 'notDetermined', cameraAvailable: false }
            : { authorization: 'authorized' },
  );
  if (cameraFixture === 'recovering') {
    return new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({
        authorization: 'denied',
        authorizationAfterRefresh: 'authorized',
        refreshesBeforeRecovery: 1,
      }),
      observationSource: makeObservationSource({
        arguments: scannerFixture
          ? ['QRScanner', '--scanner-fixture', scannerFixture]
          : ['QRScanner'],
        fixturesEnabled: true,
        dataScannerSupported: true,
      }),
    });
  }

  return new ScannerSessionStore({
    cameraAccess,
    observationSource: makeObservationSource({
      arguments: scannerFixture
        ? ['QRScanner', '--scanner-fixture', scannerFixture]
        : ['QRScanner'],
      fixturesEnabled: true,
      dataScannerSupported: true,
    }),
  });
}

describe('scanner UI', () => {
  beforeEach(() => {
    setLocale('en');
  });

  test('named scanner fixture displays observed payload', async () => {
    const store = session('authorized', 'single-code');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByText('https://example.com/fixture')).toBeTruthy();
    expect(screen.getAllByTestId('scanner-observation-payload')).toHaveLength(1);
    expect(screen.getByLabelText('Copy')).toBeTruthy();
    expect(screen.queryByText('Observed QR Code')).toBeNull();
    expect(screen.queryByText('Ready to Scan')).toBeNull();
    expect(screen.queryByText('Point the camera at a QR code. Scanning starts automatically.')).toBeNull();

    const bounds = StyleSheet.flatten(screen.getByTestId('scanner-observation-bounds').props.style);
    expect(bounds).toEqual(
      expect.objectContaining({
        left: '20%',
        top: '30%',
        width: '60%',
        height: '25%',
        borderColor: '#FFE500',
      }),
    );
  });

  test('live camera does not cover the preview with Ready to Scan', async () => {
    const store = session('authorized');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByLabelText('Live camera scan area')).toBeTruthy();
    expect(screen.getByTestId('live-scan-area')).toBeTruthy();
    expect(screen.queryByText('Ready to Scan')).toBeNull();
    expect(screen.queryByText('Point the camera at a QR code. Scanning starts automatically.')).toBeNull();
    expect(screen.queryByTestId('unavailable-state')).toBeNull();
    expect(screen.queryByTestId('scanner-observation-overlay')).toBeNull();
  });

  test('native detections draw highlight boxes over the live camera', async () => {
    const source = new NativeEngineObservationSource('visionkit');
    const store = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });
    await store.activateScanner();
    publishNativeObservations('visionkit', [
      {
        payload: 'https://survey.walmart.com/logo-qr',
        displayBounds: { x: 0.18, y: 0.22, width: 0.31, height: 0.2 },
      },
      {
        payload: 'https://survey.walmart.com/logo-qr-bottom',
        displayBounds: { x: 0.18, y: 0.52, width: 0.31, height: 0.2 },
      },
    ]);
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.queryByText('Ready to Scan')).toBeNull();
    expect(screen.getByText('https://survey.walmart.com/logo-qr')).toBeTruthy();
    expect(screen.getByText('https://survey.walmart.com/logo-qr-bottom')).toBeTruthy();
    expect(screen.getAllByTestId('scanner-observation-bounds')).toHaveLength(2);

    const firstBounds = StyleSheet.flatten(
      screen.getAllByTestId('scanner-observation-bounds')[0].props.style,
    );
    expect(firstBounds).toEqual(
      expect.objectContaining({
        left: '18%',
        top: '22%',
        width: '31%',
        height: '20%',
      }),
    );
    expect(screen.getByTestId('scanner-observation-overlay').props.pointerEvents).toBe('box-none');
  });

  test('edge fixture recognizes codes outside the center guide', async () => {
    const store = session('authorized', 'edge-codes');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByText('https://example.com/edge-left')).toBeTruthy();
    expect(screen.getByText('https://example.com/edge-right')).toBeTruthy();
    expect(screen.getByText('https://example.com/edge-top')).toBeTruthy();
    expect(screen.getByText('https://example.com/edge-bottom')).toBeTruthy();
    expect(screen.getAllByTestId('scanner-observation-payload')).toHaveLength(4);
    expect(screen.getAllByTestId('scanner-observation-copy')).toHaveLength(4);
    expect(screen.queryByText('Observed QR Code')).toBeNull();
  });

  test('first run requests camera access in scanner context', async () => {
    const store = session('not-determined');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByText('Camera Access')).toBeTruthy();
    expect(
      screen.getByText(
        'QR Scanner recognizes QR codes on this device. Camera frames are never uploaded or saved.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('camera-primary-action')).toBeNull();
    expect(screen.queryByText('Scan')).toBeNull();
  });

  test('denied access offers Settings without a dead scan control', async () => {
    const store = session('denied');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByText('Camera Access Is Off')).toBeTruthy();
    expect(
      screen.getByText('Allow camera access in Settings to scan QR codes.'),
    ).toBeTruthy();
    expect(screen.getByText('Open Settings')).toBeTruthy();
    expect(screen.getByTestId('camera-primary-action')).toBeTruthy();
    expect(screen.queryByText('Scan')).toBeNull();
  });

  test('restricted and hardware unavailable states use accurate language and no controls', async () => {
    const restricted = session('restricted');
    await restricted.activateScanner();
    const restrictedView = render(
      <ScannerScreen session={restricted} engine="visionkit" />,
    );
    expect(restrictedView.getByText('Camera Access Is Restricted')).toBeTruthy();
    expect(
      restrictedView.getByText(
        'Camera access is restricted by Screen Time or device management.',
      ),
    ).toBeTruthy();
    expect(restrictedView.queryByTestId('camera-primary-action')).toBeNull();
    restrictedView.unmount();

    const unavailable = session('hardware-unavailable');
    await unavailable.activateScanner();
    render(<ScannerScreen session={unavailable} engine="visionkit" />);
    expect(screen.getByText('Camera Unavailable')).toBeTruthy();
    expect(screen.getByText('No camera is available on this device.')).toBeTruthy();
    expect(screen.queryByTestId('camera-primary-action')).toBeNull();
  });

  test('returning from Settings recovers and activates camera', async () => {
    const store = session('recovering');
    await store.activateScanner();
    store.handleLifecycle('active');
    const view = render(<ScannerScreen session={store} engine="visionkit" />);
    expect(view.getByText('Open Settings')).toBeTruthy();

    fireEvent.press(view.getByTestId('camera-primary-action'));
    act(() => {
      store.handleLifecycle('active');
    });

    expect(view.queryByText('Ready to Scan')).toBeNull();
    expect(
      view.queryByText('Point the camera at a QR code. Scanning starts automatically.'),
    ).toBeNull();
    expect(view.getByLabelText('Live camera scan area')).toBeTruthy();
    expect(view.getByTestId('live-scan-area')).toBeTruthy();
    expect(view.queryByText('Scan')).toBeNull();
  });

  test('fixture without detections still shows the empty scan prompt', async () => {
    const store = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: new ScannerObservationFixtureSource({
        engineID: 'fixture.empty',
      }),
    });
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByText('Ready to Scan')).toBeTruthy();
    expect(
      screen.getByText('Point the camera at a QR code. Scanning starts automatically.'),
    ).toBeTruthy();
  });

  test('history placeholder is reachable', () => {
    render(<HistoryScreen />);
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Your scan history will appear here.')).toBeTruthy();
  });

  test('destination names are localized', () => {
    setLocale('es');
    render(<HistoryScreen />);
    expect(screen.getByText('Historial')).toBeTruthy();
    expect(screen.getByText('Tu historial de escaneos aparecerá aquí.')).toBeTruthy();
  });

  test('camera unavailable state is localized', async () => {
    setLocale('es');
    const store = session('restricted');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    expect(screen.getByText('El acceso a la cámara está restringido')).toBeTruthy();
    expect(
      screen.getByText(
        'El acceso a la cámara está restringido por Tiempo en pantalla o la gestión del dispositivo.',
      ),
    ).toBeTruthy();
  });
});
