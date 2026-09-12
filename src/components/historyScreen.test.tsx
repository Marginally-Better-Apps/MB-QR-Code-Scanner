import { fireEvent, render, screen } from '@testing-library/react-native';

import { HistoryScreen } from '@/components/HistoryScreen';
import {
  REDACTED_HISTORY_KIND,
  WIFI_HISTORY_KIND,
  WIFI_STORAGE_SUMMARY,
  type StoredHistoryEvent,
} from '@/history/historyPolicy';
import { setLocale } from '@/i18n';
import { HistoryEventsProvider } from '@/state/historyEvents';

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

const PARSER = 1;
const NOW = new Date('2026-09-12T18:00:00.000Z');
const OTP_SECRET = 'JBSWY3DPEHPK3PXP';

function event(overrides: Partial<StoredHistoryEvent>): StoredHistoryEvent {
  return {
    id: 'evt',
    acceptedAt: '2026-09-12T17:04:00.000Z',
    kind: 'url',
    summary: 'example.com/today',
    original: 'https://example.com/today',
    parserVersion: PARSER,
    ...overrides,
  };
}

function renderHistory(
  events: StoredHistoryEvent[],
  extra?: { onBack?: () => void; locale?: string },
) {
  setLocale(extra?.locale ?? 'en');
  return render(
    <HistoryScreen
      events={events}
      now={NOW}
      timeZone="UTC"
      locale={extra?.locale === 'es' ? 'es' : 'en-US'}
      onBack={extra?.onBack}
    />,
  );
}

describe('HistoryScreen (HIS-02)', () => {
  beforeEach(() => {
    setLocale('en');
  });

  test('empty state explains accepted scans and offers a path back to Scanner', () => {
    const onBack = jest.fn();
    render(<HistoryScreen onBack={onBack} />);

    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Accepted scans appear here.')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByLabelText('Scan a QR code')).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-scan-cta'));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('history-back'));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  test('empty state is localized', () => {
    setLocale('es');
    render(<HistoryScreen />);
    expect(screen.getByText('Historial')).toBeTruthy();
    expect(screen.getByText('Los escaneos aceptados aparecen aquí.')).toBeTruthy();
    expect(screen.getByLabelText('Atrás')).toBeTruthy();
    expect(screen.getByLabelText('Escanear un código QR')).toBeTruthy();
  });

  test('renders without a provider as an empty list', () => {
    render(<HistoryScreen />);
    expect(screen.getByTestId('history-empty')).toBeTruthy();
    expect(screen.queryByTestId('history-row')).toBeNull();
  });

  test('populated history groups rows and shows type icon, safe title, and time', () => {
    renderHistory([
      event({
        id: 'today-new',
        acceptedAt: '2026-09-12T17:04:00.000Z',
        summary: 'example.com/today',
      }),
      event({
        id: 'yesterday',
        acceptedAt: '2026-09-11T15:30:00.000Z',
        summary: 'example.com/yesterday',
        original: 'https://example.com/yesterday',
      }),
    ]);

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('example.com/today')).toBeTruthy();
    expect(screen.getByText('example.com/yesterday')).toBeTruthy();
    expect(screen.getByText('5:04 PM')).toBeTruthy();
    expect(screen.getByText('3:30 PM')).toBeTruthy();
    expect(screen.getAllByText('link').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('history-empty')).toBeNull();
  });

  test('redacted and wifi rows never expose payload secrets', () => {
    renderHistory([
      event({
        id: 'secret',
        kind: REDACTED_HISTORY_KIND,
        summary: null,
        original: `otpauth://totp/Example:alice?secret=${OTP_SECRET}`,
      }),
      event({
        id: 'wifi',
        kind: WIFI_HISTORY_KIND,
        summary: WIFI_STORAGE_SUMMARY,
        original: 'WIFI:T:WPA;S:home-network;P:supersecret123;;',
        acceptedAt: '2026-09-12T16:00:00.000Z',
      }),
    ]);

    expect(screen.getByText('Sensitive scan')).toBeTruthy();
    expect(screen.getByText('Wi-Fi network')).toBeTruthy();
    expect(screen.getByText('eye.slash')).toBeTruthy();
    expect(screen.getByText('wifi')).toBeTruthy();
    expect(screen.queryByText(/JBSWY3DPEHPK3PXP/)).toBeNull();
    expect(screen.queryByText(/otpauth/)).toBeNull();
    expect(screen.queryByText(/supersecret123/)).toBeNull();
    expect(screen.queryByText(/home-network/)).toBeNull();
  });

  test('reads events from the history provider when no events prop is passed', () => {
    render(
      <HistoryEventsProvider
        events={[
          event({
            id: 'from-context',
            summary: 'example.com/from-store',
          }),
        ]}>
        <HistoryScreen now={NOW} timeZone="UTC" locale="en-US" />
      </HistoryEventsProvider>,
    );

    expect(screen.getByText('example.com/from-store')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
  });
});
