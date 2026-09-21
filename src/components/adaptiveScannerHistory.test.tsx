import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { I18nManager, StyleSheet } from 'react-native';

import { HistoryScreen } from '@/components/HistoryScreen';
import { ScannerScreen } from '@/components/ScannerScreen';
import type { StoredHistoryEvent } from '@/history/historyPolicy';
import { setLocale } from '@/i18n';
import { ScannerSessionStore } from '@/scanner';
import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { makeObservationSource } from '@/scanner/factory';
import {
  NativeEngineObservationSource,
  publishNativeObservations,
} from '@/scanner/nativeSource';

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

function setWindowSize(width: number, height: number) {
  // NB: require (not `import *`) returns the live module exports object,
  // so the spy reaches every consumer of useWindowDimensions.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale: 2,
  });
}

function setRTL(rtl: boolean) {
  Object.defineProperty(I18nManager, 'isRTL', {
    configurable: true,
    value: rtl,
  });
}

function liveStore() {
  return new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: new NativeEngineObservationSource('visionkit'),
  });
}

function fixtureStore(scannerFixture: string) {
  return new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', scannerFixture],
      fixturesEnabled: true,
    }),
  });
}

const BOUNDS_A = { x: 0.18, y: 0.22, width: 0.31, height: 0.2 };
const BOUNDS_B = { x: 0.18, y: 0.52, width: 0.31, height: 0.2 };

function publishPair() {
  publishNativeObservations('visionkit', [
    { payload: 'https://example.com/adaptive-a', displayBounds: BOUNDS_A },
    { payload: 'https://example.com/adaptive-b', displayBounds: BOUNDS_B },
  ]);
}

const NOW = new Date('2026-09-12T18:00:00.000Z');

function historyEvent(overrides: Partial<StoredHistoryEvent>): StoredHistoryEvent {
  return {
    id: 'evt',
    acceptedAt: '2026-09-12T17:04:00.000Z',
    kind: 'url',
    summary: 'example.com/today',
    original: 'https://example.com/today',
    parserVersion: 1,
    ...overrides,
  };
}

describe('adaptive scanner and history (QLT-03)', () => {
  const originalRTL = I18nManager.isRTL;

  beforeEach(() => {
    setLocale('en');
    setRTL(false);
    setWindowSize(390, 844);
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    setRTL(originalRTL);
    jest.restoreAllMocks();
  });

  test('preview fills the scan area with aspect-fill alignment', async () => {
    const store = liveStore();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    const preview = screen.getByTestId('scanner-preview');
    const style = StyleSheet.flatten(preview.props.style);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe(0);
    expect(style.left).toBe(0);
    expect(style.right).toBe(0);
    expect(style.bottom).toBe(0);
  });

  test('observation overlays stay aligned through rotation and live resizing', async () => {
    const store = liveStore();
    await store.activateScanner();
    const view = render(<ScannerScreen session={store} engine="visionkit" />);
    act(() => {
      publishPair();
    });

    const before = screen
      .getAllByTestId('scanner-observation-bounds')
      .map((node) => StyleSheet.flatten(node.props.style));
    expect(before[0]).toEqual(
      expect.objectContaining({
        left: '18%',
        top: '22%',
        width: '31%',
        height: '20%',
      }),
    );

    // Rotate to landscape: overlay percentages must not drift.
    setWindowSize(844, 390);
    view.rerender(<ScannerScreen session={store} engine="visionkit" />);

    const after = screen
      .getAllByTestId('scanner-observation-bounds')
      .map((node) => StyleSheet.flatten(node.props.style));
    expect(after).toEqual(before);
    expect(screen.getByTestId('scanner-preview')).toBeTruthy();
    expect(screen.getByTestId('center-scan-guide')).toBeTruthy();
  });

  test('guide stays comfortably sized on iPhone and never giant on iPad', async () => {
    const store = liveStore();
    await store.activateScanner();
    const view = render(<ScannerScreen session={store} engine="visionkit" />);

    const phoneBox = StyleSheet.flatten(
      screen.getByTestId('center-scan-guide-box').props.style,
    );
    expect(phoneBox.width).toBeGreaterThanOrEqual(160);
    expect(phoneBox.width).toBeLessThanOrEqual(200);

    // iPad landscape: the guide is capped, not proportional to the canvas.
    setWindowSize(1024, 768);
    view.rerender(<ScannerScreen session={store} engine="visionkit" />);
    const padBox = StyleSheet.flatten(
      screen.getByTestId('center-scan-guide-box').props.style,
    );
    expect(padBox.width).toBeGreaterThanOrEqual(160);
    expect(padBox.width).toBeLessThanOrEqual(240);
    expect(padBox.width).toBe(220);
  });

  test('narrow layouts dock the result accessory at the bottom', async () => {
    const store = liveStore();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    act(() => {
      publishPair();
    });
    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));

    const style = StyleSheet.flatten(
      screen.getByTestId('sticky-result-container').props.style,
    );
    expect(style.justifyContent).toBe('flex-end');
    expect(style.maxWidth).toBeUndefined();
  });

  test('wide layouts move the result to a trailing inspector that never covers the target', async () => {
    setWindowSize(1024, 768);
    const store = liveStore();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    act(() => {
      publishPair();
    });
    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));

    const style = StyleSheet.flatten(
      screen.getByTestId('sticky-result-container').props.style,
    );
    expect(style.maxWidth).toBeLessThanOrEqual(360);
    expect(style.right).toBeDefined();
    expect(screen.getByTestId('center-scan-guide')).toBeTruthy();
  });

  test('RTL mirrors the trailing inspector to the leading edge', async () => {
    setWindowSize(1024, 768);
    setRTL(true);
    const store = liveStore();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    act(() => {
      publishPair();
    });
    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));

    const style = StyleSheet.flatten(
      screen.getByTestId('sticky-result-container').props.style,
    );
    expect(style.left).toBeDefined();
    expect(style.right).toBeUndefined();
  });

  test('history uses one column when narrow and two when wide', () => {
    const events = [
      historyEvent({ id: 'one', summary: 'example.com/one' }),
      historyEvent({
        id: 'two',
        summary: 'example.com/two',
        original: 'https://example.com/two',
      }),
    ];
    const narrow = render(
      <HistoryScreen
        events={events}
        now={NOW}
        timeZone="UTC"
        locale="en-US"
        scheduleUndoExpiry={() => {}}
      />,
    );
    expect(narrow.getByTestId('history-list')).toBeTruthy();
    expect(narrow.queryByTestId('history-grid')).toBeNull();
    expect(narrow.getByText('example.com/one')).toBeTruthy();
    narrow.unmount();

    setWindowSize(1024, 768);
    render(
      <HistoryScreen
        events={events}
        now={NOW}
        timeZone="UTC"
        locale="en-US"
        scheduleUndoExpiry={() => {}}
      />,
    );
    expect(screen.getByTestId('history-list')).toBeTruthy();
    expect(screen.getByTestId('history-grid')).toBeTruthy();
    const cells = screen.getAllByTestId('history-grid-cell');
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(StyleSheet.flatten(cell.props.style).width).toBe('50%');
    }
    expect(screen.getByText('example.com/one')).toBeTruthy();
    expect(screen.getByText('example.com/two')).toBeTruthy();
  });

  test('history stays single-column in Split View widths', () => {
    setWindowSize(560, 768);
    render(
      <HistoryScreen
        events={[historyEvent({ id: 'one' })]}
        now={NOW}
        timeZone="UTC"
        locale="en-US"
        scheduleUndoExpiry={() => {}}
      />,
    );
    expect(screen.getByTestId('history-list')).toBeTruthy();
    expect(screen.queryByTestId('history-grid')).toBeNull();
  });

  test('Escape dismisses the multi-code chooser without clearing the scan', async () => {
    const store = liveStore();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    act(() => {
      publishPair();
    });
    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));
    expect(screen.getByTestId('multi-code-chooser')).toBeTruthy();

    fireEvent(screen.getByTestId('multi-code-chooser'), 'onAccessibilityAction', {
      nativeEvent: { actionName: 'escape' },
    });

    expect(screen.queryByTestId('multi-code-chooser')).toBeNull();
    expect(screen.getByTestId('multi-code-chooser-trigger')).toBeTruthy();
  });

  test('Escape clears the sticky result via keyboard', async () => {
    const store = fixtureStore('single-code');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    expect(screen.getByTestId('sticky-result-accessory')).toBeTruthy();

    fireEvent(screen.getByTestId('sticky-result-accessory'), 'onAccessibilityAction', {
      nativeEvent: { actionName: 'escape' },
    });

    expect(screen.queryByTestId('sticky-result-accessory')).toBeNull();
  });

  test('Escape backs out of history detail', () => {
    render(
      <HistoryScreen
        events={[historyEvent({ id: 'url' })]}
        now={NOW}
        timeZone="UTC"
        locale="en-US"
        scheduleUndoExpiry={() => {}}
      />,
    );
    fireEvent.press(screen.getByTestId('history-row'));
    expect(screen.getByTestId('history-detail')).toBeTruthy();

    fireEvent(screen.getByTestId('history-detail'), 'onAccessibilityAction', {
      nativeEvent: { actionName: 'escape' },
    });

    expect(screen.queryByTestId('history-detail')).toBeNull();
    expect(screen.getByTestId('history-list')).toBeTruthy();
  });

  test('controls stay focusable with pointer-sized targets and labels', async () => {
    const store = liveStore();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    act(() => {
      publishPair();
    });

    const history = screen.getByTestId('open-history');
    expect(history.props.accessibilityRole).toBe('button');
    expect(history.props.accessibilityLabel).toBe('History');

    const trigger = screen.getByTestId('multi-code-chooser-trigger');
    expect(trigger.props.accessibilityRole).toBe('button');
    expect(trigger.props.accessibilityLabel).toMatch(/codes found/);
    const triggerStyle = StyleSheet.flatten(trigger.props.style);
    expect(triggerStyle.minHeight ?? triggerStyle.height).toBeGreaterThanOrEqual(44);
    expect(trigger.props.hitSlop ?? triggerStyle.minWidth).toBeTruthy();
  });

  test('result text supports large text without clipping semantics', async () => {
    const store = fixtureStore('single-code');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(
      screen.getByTestId('sticky-result-url').props.maxFontSizeMultiplier,
    ).toBe(2.2);
  });

  test('universal build targets iPhone and iPad with rotation enabled', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appJson = require('../../app.json');
    expect(appJson.expo.platforms).toContain('ios');
    expect(appJson.expo.ios.supportsTablet).toBe(true);
    expect(appJson.expo.orientation).toBe('default');
  });
});
