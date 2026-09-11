import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { ScannerScreen } from '@/components/ScannerScreen';
import { setLocale } from '@/i18n';
import { ScannerSessionStore } from '@/scanner';
import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { ScannerObservationFixtureSource } from '@/scanner/fixtures';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => {}),
}));

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children, ...props }: { children: unknown }) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
  isGlassEffectAPIAvailable: jest.fn(() => false),
  isLiquidGlassAvailable: jest.fn(() => false),
}));

jest.mock('expo-symbols', () => {
  const { Text } = require('react-native');
  return {
    SymbolView: ({ name, ...props }: { name: string }) => (
      <Text {...props}>{name}</Text>
    ),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@/components/ScannerPreview', () => ({
  ScannerPreview: () => null,
}));

function stickySession() {
  const source = new ScannerObservationFixtureSource({
    engineID: 'fixture.sticky-ui',
  });
  const store = new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: source,
  });
  return { source, store };
}

function bounds() {
  return { x: 0.2, y: 0.3, width: 0.6, height: 0.25 };
}

describe('sticky session result UI (SCN-04)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('cold launch starts empty with no sticky accessory', async () => {
    const { store } = stickySession();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.queryByTestId('sticky-result-accessory')).toBeNull();
    expect(screen.getByText('Ready to Scan')).toBeTruthy();
  });

  test('scan → look-away → tab switch → replace → clear', async () => {
    const { source, store } = stickySession();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    // Scan: first accepted event appears in the bottom accessory.
    act(() => {
      source.emit([
        { rawPayload: 'https://example.com/first', displayBounds: bounds() },
      ]);
    });
    expect(screen.getByTestId('sticky-result-accessory')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(
      'https://example.com/first',
    );

    // Look away: empty frame never clears.
    act(() => {
      source.emit([]);
    });
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(
      'https://example.com/first',
    );

    // Tab switch: obscured/visible preserves the current result.
    act(() => {
      store.handlePresentation('obscured');
    });
    act(() => {
      store.handlePresentation('visible');
    });
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(
      'https://example.com/first',
    );

    // Replace: different payload swaps in a single accessory.
    act(() => {
      source.emit([
        { rawPayload: 'https://example.com/second', displayBounds: bounds() },
      ]);
    });
    expect(screen.getAllByTestId('sticky-result-accessory')).toHaveLength(1);
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(
      'https://example.com/second',
    );

    // Clear: removes only the current result; looking away returns to empty.
    fireEvent.press(screen.getByTestId('sticky-result-clear'));
    expect(screen.queryByTestId('sticky-result-accessory')).toBeNull();

    act(() => {
      source.emit([]);
    });
    expect(screen.queryByTestId('sticky-result-accessory')).toBeNull();
    expect(screen.getByText('Ready to Scan')).toBeTruthy();
  });

  test('accessory expands to detail and clears from the expanded view', async () => {
    const { source, store } = stickySession();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    act(() => {
      source.emit([
        { rawPayload: 'https://example.com/expand-me', displayBounds: bounds() },
      ]);
    });

    expect(screen.queryByTestId('sticky-result-detail')).toBeNull();
    fireEvent.press(screen.getByTestId('sticky-result-expand'));
    expect(screen.getByTestId('sticky-result-detail')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sticky-result-clear'));
    expect(screen.queryByTestId('sticky-result-accessory')).toBeNull();
  });

  test('sticky result survives background and resume', async () => {
    const { source, store } = stickySession();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    act(() => {
      source.emit([
        { rawPayload: 'https://example.com/bg', displayBounds: bounds() },
      ]);
    });
    act(() => {
      store.handleLifecycle('background');
    });
    act(() => {
      store.handleLifecycle('active');
    });

    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(
      'https://example.com/bg',
    );
  });
});
