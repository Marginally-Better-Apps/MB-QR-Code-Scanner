import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { StyleSheet } from 'react-native';

import { ScannerScreen } from '@/components/ScannerScreen';
import { setLocale } from '@/i18n';
import { ScannerSessionStore } from '@/scanner';
import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { makeObservationSource } from '@/scanner/factory';
import { stableCandidateId } from '@/scanner/multiCode';

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

function storeFor(fixture: string) {
  return new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', fixture],
      fixturesEnabled: true,
    }),
  });
}

describe('multi-code disambiguation UI (SCN-05)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('two simultaneous codes show chooser trigger with kind + safe summary rows', async () => {
    const store = storeFor('two-codes');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    const trigger = screen.getByTestId('multi-code-chooser-trigger');
    expect(trigger).toBeTruthy();
    expect(screen.getByText('2 codes found · Choose')).toBeTruthy();

    // Rows hidden until the trigger opens the chooser.
    expect(screen.queryByTestId('multi-code-chooser')).toBeNull();
    fireEvent.press(trigger);
    expect(screen.getByTestId('multi-code-chooser')).toBeTruthy();

    const rows = screen.getAllByTestId('multi-code-row');
    expect(rows).toHaveLength(2);
    // Each row exposes kind plus a safe summary (no raw controls).
    const labels = rows.map((row) => String(row.props.accessibilityLabel ?? ''));
    expect(labels.some((label) => /url/i.test(label))).toBe(true);
    expect(labels.some((label) => /text/i.test(label))).toBe(true);
    for (const row of rows) {
      expect(String(row.props.accessibilityLabel ?? '')).not.toMatch(/[\n\r\x00]/);
    }
  });

  test('three codes render spatial-order rows with 44x44 targets', async () => {
    const store = storeFor('three-codes');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    expect(screen.getByText('3 codes found · Choose')).toBeTruthy();
    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));

    const rows = screen.getAllByTestId('multi-code-row');
    expect(rows).toHaveLength(3);
    // Spatial order: top → bottom (three-top, middle, bottom).
    const labels = rows.map((row) => String(row.props.accessibilityLabel ?? ''));
    expect(labels[0]).toMatch(/three-top|example\.com/);
    expect(labels[1]).toMatch(/middle/);
    expect(labels[2]).toMatch(/myapp|pay/);

    for (const row of rows) {
      expect(row.props.accessibilityRole).toBe('button');
      const style = StyleSheet.flatten(row.props.style);
      const height = style.minHeight ?? style.height ?? 0;
      const width = style.minWidth ?? style.width ?? 0;
      expect(Number(height)).toBeGreaterThanOrEqual(44);
      expect(Number(width)).toBeGreaterThanOrEqual(44);
    }

    const chooser = screen.getByTestId('multi-code-chooser');
    expect(chooser.props.accessibilityLabel).toMatch(/Select a QR code/i);
  });

  test('choosing a row accepts exactly that payload', async () => {
    const store = storeFor('two-codes');
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));
    const rows = screen.getAllByTestId('multi-code-row');
    const rightId = stableCandidateId('Hello from the right code');
    const rightRow = rows.find((row) => row.props.nativeID === rightId);
    expect(rightRow).toBeTruthy();
    fireEvent.press(rightRow!);

    // Sticky result shows exactly the chosen payload (safe preview equals raw here).
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(
      'Hello from the right code',
    );
  });

  test('stable identifiers link outlines to chooser rows; reorder never round-robins', async () => {
    const { ScannerObservationFixtureSource } = require('@/scanner/fixtures');
    const source = new ScannerObservationFixtureSource({ engineID: 'fixture.reorder' });
    const store = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });
    await store.activateScanner();
    render(<ScannerScreen session={store} engine="visionkit" />);

    const left = {
      rawPayload: 'https://example.com/left-reorder',
      displayBounds: { x: 0.05, y: 0.4, width: 0.15, height: 0.15 },
    };
    const right = {
      rawPayload: 'Hello right reorder',
      displayBounds: { x: 0.8, y: 0.4, width: 0.15, height: 0.15 },
    };
    act(() => {
      source.emit([left, right]);
      source.emit([left, right]);
    });
    fireEvent.press(screen.getByTestId('multi-code-chooser-trigger'));
    const beforeOutlines = screen
      .getAllByTestId('scanner-observation-bounds')
      .map((node) => node.props.nativeID)
      .sort();
    const beforeRows = screen
      .getAllByTestId('multi-code-row')
      .map((node) => node.props.nativeID)
      .sort();
    expect(beforeOutlines).toEqual(beforeRows);
    expect(beforeOutlines).toEqual(
      [stableCandidateId(left.rawPayload), stableCandidateId(right.rawPayload)].sort(),
    );

    // Choose left, then reorder the native callback: current must stick.
    const rows = screen.getAllByTestId('multi-code-row');
    fireEvent.press(rows.find((row) => row.props.nativeID === stableCandidateId(left.rawPayload))!);
    const chosenPayload = screen.getByTestId('sticky-result-payload').props.children;

    act(() => {
      source.emit([right, left]);
    });
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(chosenPayload);
    const afterOutlines = screen
      .getAllByTestId('scanner-observation-bounds')
      .map((node) => node.props.nativeID)
      .sort();
    expect(afterOutlines).toEqual(beforeOutlines);
  });
});
