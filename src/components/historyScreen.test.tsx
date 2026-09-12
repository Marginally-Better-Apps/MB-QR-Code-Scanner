import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HistoryScreen } from '@/components/HistoryScreen';
import {
  REDACTED_HISTORY_KIND,
  WIFI_HISTORY_KIND,
  WIFI_STORAGE_SUMMARY,
  type StoredHistoryEvent,
} from '@/history/historyPolicy';
import { setLocale } from '@/i18n';
import type { ResultActionDeps } from '@/scanner/actionRouter';
import { HistoryEventsProvider } from '@/state/historyEvents';

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

function mockDeps(): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
  };
}

function renderHistory(
  events: StoredHistoryEvent[],
  extra?: { onBack?: () => void; locale?: string; actionDeps?: ResultActionDeps },
) {
  setLocale(extra?.locale ?? 'en');
  return render(
    <HistoryScreen
      events={events}
      now={NOW}
      timeZone="UTC"
      locale={extra?.locale === 'es' ? 'es' : 'en-US'}
      onBack={extra?.onBack}
      actionDeps={extra?.actionDeps}
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

  test('tapping a safe row opens shared result detail with current actions', () => {
    const deps = mockDeps();
    renderHistory(
      [
        event({
          id: 'today-url',
          kind: 'text',
          summary: 'stale stored summary',
          original: 'https://example.com/today',
        }),
      ],
      { actionDeps: deps },
    );

    fireEvent.press(screen.getByTestId('history-row'));

    expect(screen.getByTestId('history-detail')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-accessory')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-open')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-share')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-host').props.children).toBe('example.com');
    expect(screen.queryByText('stale stored summary')).toBeNull();
  });

  test('copy, share, and open from a replayed URL match Scanner', async () => {
    const deps = mockDeps();
    renderHistory(
      [event({ id: 'url', original: 'https://example.com/today' })],
      { actionDeps: deps },
    );

    fireEvent.press(screen.getByTestId('history-row'));
    fireEvent.press(screen.getByTestId('sticky-result-open'));
    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\/today/),
    );

    fireEvent.press(screen.getByTestId('sticky-result-copy'));
    await act(async () => {});
    expect(deps.copyText).toHaveBeenCalledWith('https://example.com/today');

    fireEvent.press(screen.getByTestId('sticky-result-share'));
    await act(async () => {});
    expect(deps.shareText).toHaveBeenCalledWith('https://example.com/today');
  });

  test('detail shows localized relative time and an exact date/time', () => {
    renderHistory([event({ id: 'timed' })]);

    fireEvent.press(screen.getByTestId('history-row'));

    expect(screen.getByTestId('history-detail-relative').props.children).toMatch(
      /56 minutes ago/,
    );
    const exact = String(screen.getByTestId('history-detail-exact').props.children);
    expect(exact).toMatch(/Sep(tember)? 12, 2026/);
    expect(exact).toMatch(/5:04/);
  });

  test('tapping a redacted row explains that the secret was not saved', () => {
    renderHistory([
      event({
        id: 'secret',
        kind: REDACTED_HISTORY_KIND,
        summary: null,
        original: `otpauth://totp/Example:alice?secret=${OTP_SECRET}`,
      }),
    ]);

    fireEvent.press(screen.getByTestId('history-row'));

    expect(screen.getByTestId('history-detail')).toBeTruthy();
    expect(screen.getByTestId('history-detail-not-saved')).toBeTruthy();
    expect(screen.getByText('This sensitive code was not saved.')).toBeTruthy();
    expect(screen.queryByTestId('sticky-result-accessory')).toBeNull();
    expect(screen.queryByTestId('sticky-result-copy')).toBeNull();
    expect(screen.queryByTestId('sticky-result-share')).toBeNull();
    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(screen.queryByText(/JBSWY3DPEHPK3PXP/)).toBeNull();
    expect(screen.queryByText(/otpauth/)).toBeNull();
  });

  test('tapping a wifi row explains it was not saved and hides secrets', () => {
    renderHistory([
      event({
        id: 'wifi',
        kind: WIFI_HISTORY_KIND,
        summary: WIFI_STORAGE_SUMMARY,
        original: 'WIFI:T:WPA;S:home-network;P:supersecret123;;',
      }),
    ]);

    fireEvent.press(screen.getByTestId('history-row'));

    expect(screen.getByText('The Wi-Fi network was not saved.')).toBeTruthy();
    expect(screen.queryByTestId('sticky-result-copy')).toBeNull();
    expect(screen.queryByText(/supersecret123/)).toBeNull();
    expect(screen.queryByText(/home-network/)).toBeNull();
  });

  test('redacted detail and timestamps are localized', () => {
    renderHistory(
      [
        event({
          id: 'secret',
          kind: REDACTED_HISTORY_KIND,
          summary: null,
          original: null,
        }),
      ],
      { locale: 'es' },
    );

    fireEvent.press(screen.getByTestId('history-row'));

    expect(screen.getByText('Este código confidencial no se guardó.')).toBeTruthy();
    expect(String(screen.getByTestId('history-detail-relative').props.children)).toMatch(
      /minuto/i,
    );
  });

  test('back from detail returns to the list without leaving History', () => {
    const onBack = jest.fn();
    renderHistory([event({ id: 'url' })], { onBack });

    fireEvent.press(screen.getByTestId('history-row'));
    expect(screen.getByTestId('history-detail')).toBeTruthy();

    fireEvent.press(screen.getByTestId('history-back'));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByTestId('history-detail')).toBeNull();
    expect(screen.getByTestId('history-list')).toBeTruthy();
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
