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
    engineID: 'fixture.liquid-glass',
  });
  const store = new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: source,
  });
  return { source, store };
}

describe('Liquid Glass surfaces (QLT-01)', () => {
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

  test('current Liquid Glass sticky accessory keeps white content over camera', async () => {
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(true);
    render(
      <StickyResultBar payload="https://example.com/glass" onClear={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chrome-surface-liquidGlass')).toBeTruthy();
    });
    expect(screen.getByTestId('sticky-result-accessory').props.colorScheme).toBe('dark');
    expect(StyleSheet.flatten(screen.getByTestId('sticky-result-host').props.style).color).toBe(
      '#fff',
    );
  });

  test('fallback sticky accessory uses an opaque semantic fill', async () => {
    render(
      <StickyResultBar payload="https://example.com/fallback" onClear={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chrome-surface-semanticOpaque')).toBeTruthy();
    });
    const style = StyleSheet.flatten(screen.getByTestId('sticky-result-accessory').props.style);
    expect(style.backgroundColor).toBe('#1c1c1e');
    expect(String(style.backgroundColor)).not.toMatch(/rgba/i);
  });

  test('Reduced Transparency forces opaque sticky chrome even when Liquid Glass exists', async () => {
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(true);
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    render(
      <StickyResultBar payload="https://example.com/reduce" onClear={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chrome-surface-semanticOpaque')).toBeTruthy();
    });
    expect(screen.getByTestId('sticky-result-accessory').props.colorScheme).toBeUndefined();
    expect(
      StyleSheet.flatten(screen.getByTestId('sticky-result-accessory').props.style).backgroundColor,
    ).toBe('#1c1c1e');
  });

  test('Increase Contrast thickens opaque media chrome borders', async () => {
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(true);
    render(
      <StickyResultBar payload="https://example.com/contrast" onClear={() => {}} />,
    );
    await waitFor(() => {
      const style = StyleSheet.flatten(
        screen.getByTestId('sticky-result-accessory').props.style,
      );
      expect(style.borderWidth).toBeGreaterThanOrEqual(2);
      expect(style.backgroundColor).toBe('#000000');
      expect(style.borderColor).toBe('#ffffff');
    });
  });

  test('multi-code chooser adopts the same chrome policy', async () => {
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(true);
    render(
      <MultiCodeChooser
        candidates={[
          {
            id: 'a',
            rawPayload: 'https://example.com/a',
            bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            stability: 1,
            score: 1,
          },
          {
            id: 'b',
            rawPayload: 'https://example.com/b',
            bounds: { x: 0.5, y: 0.1, width: 0.2, height: 0.2 },
            stability: 1,
            score: 0.5,
          },
        ]}
        onSelect={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('chrome-surface-liquidGlass')).toBeTruthy();
    });
  });

  test('history control marks Liquid Glass chrome without speaking the kind', async () => {
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(true);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(true);
    const { store } = stickySession();
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);
    await waitFor(() => {
      expect(screen.getByTestId('open-history-chrome-liquidGlass')).toBeTruthy();
    });
    expect(screen.getByLabelText('History')).toBeTruthy();
  });
});
