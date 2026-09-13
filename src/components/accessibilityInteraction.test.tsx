import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { MultiCodeChooser } from '@/components/MultiCodeChooser';
import { ScannerScreen } from '@/components/ScannerScreen';
import { StickyResultBar } from '@/components/StickyResultBar';
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
    engineID: 'fixture.a11y',
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

describe('accessibility interaction audit (QLT-02)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sticky actions are at least 44×44 and labeled in a stable order', () => {
    render(
      <StickyResultBar payload="https://example.com/a11y" onClear={() => {}} />,
    );
    const actions = ['sticky-result-open', 'sticky-result-copy', 'sticky-result-share', 'sticky-result-expand', 'sticky-result-clear'];
    const labels = ['Open link', 'Copy', 'Share', 'Show details', 'Clear'];
    for (let i = 0; i < actions.length; i += 1) {
      const node = screen.getByTestId(actions[i]);
      const style = StyleSheet.flatten(node.props.style);
      expect(style.minWidth ?? style.width).toBeGreaterThanOrEqual(44);
      expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
      expect(node.props.accessibilityLabel).toBe(labels[i]);
    }
    expect(StyleSheet.flatten(screen.getByTestId('sticky-result-actions').props.style).flexWrap).toBe(
      'wrap',
    );
  });

  test('VoiceOver announces one accepted scan and ignores empty frames', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const { source, store } = stickySession();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    act(() => {
      source.emit([{ rawPayload: 'https://example.com/one', displayBounds: bounds() }]);
    });
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith('Accepted scan: example.com/one');
    });
    const afterAccept = announce.mock.calls.length;

    act(() => {
      source.emit([]);
      source.emit([{ rawPayload: 'https://example.com/one', displayBounds: bounds() }]);
    });
    expect(announce.mock.calls.length).toBe(afterAccept);

    act(() => {
      source.emit([{ rawPayload: 'https://example.com/two', displayBounds: bounds() }]);
    });
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith('Accepted scan: example.com/two');
      expect(announce.mock.calls.length).toBe(afterAccept + 1);
    });
  });

  test('chooser rows keep spatial order and include kind text, not color alone', () => {
    render(
      <MultiCodeChooser
        candidates={[
          {
            id: 'right',
            rawPayload: 'https://example.com/right',
            bounds: { x: 0.7, y: 0.2, width: 0.2, height: 0.2 },
            stability: 1,
            score: 1,
          },
          {
            id: 'left',
            rawPayload: 'https://example.com/left',
            bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
            stability: 1,
            score: 0.5,
          },
        ]}
        onSelect={() => {}}
      />,
    );
    const rows = screen.getAllByTestId('multi-code-row');
    expect(rows[0].props.accessibilityLabel).toMatch(/^1 of 2, url, /);
    expect(rows[0].props.nativeID).toBe('left');
    expect(rows[1].props.nativeID).toBe('right');
    expect(screen.getAllByText('url')).toHaveLength(2);
  });

  test('chrome kind stays out of VoiceOver labels and hints', async () => {
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(true);
    render(
      <StickyResultBar payload="https://example.com/voice" onClear={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chrome-surface-liquidGlass')).toBeTruthy();
    });
    const accessory = screen.getByTestId('sticky-result-accessory');
    expect(accessory.props.accessibilityLabel).toBe('Scan result');
    expect(accessory.props.accessibilityHint).toBeUndefined();
    expect(accessory.props.accessibilityLabel).not.toMatch(/liquidGlass|semanticOpaque/i);
  });

  test('permission denied state remains operable with a labeled Settings action', async () => {
    const store = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'denied' }),
      observationSource: new ScannerObservationFixtureSource({ engineID: 'fixture.denied' }),
    });
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    expect(screen.getByTestId('unavailable-state').props.accessibilityRole).toBe('summary');
    expect(screen.getByLabelText('Open Settings')).toBeTruthy();
  });
});
