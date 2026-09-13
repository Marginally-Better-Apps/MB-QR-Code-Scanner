import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { Swipeable } = require('react-native-gesture-handler');
  return { __esModule: true, default: Swipeable };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { Pressable, ScrollView, View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
    ScrollView,
    Swipeable: ({
      children,
      renderRightActions,
      renderLeftActions,
      onSwipeableOpen,
      testID,
    }: {
      children: unknown;
      renderRightActions?: () => unknown;
      renderLeftActions?: () => unknown;
      onSwipeableOpen?: (direction: 'left' | 'right') => void;
      testID?: string;
    }) => {
      const [open, setOpen] = React.useState(false);
      const trailing = renderRightActions ?? renderLeftActions;
      const openDirection = renderRightActions ? 'right' : 'left';
      return (
        <View testID={testID}>
          <Pressable testID="history-row-swipe-trailing" onPress={() => setOpen(true)} />
          <Pressable
            testID="history-row-swipe-full"
            onPress={() => onSwipeableOpen?.(openDirection)}
          />
          {open ? trailing?.() : null}
          {children}
        </View>
      );
    },
  };
});

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
  extra?: {
    onBack?: () => void;
    locale?: string;
    actionDeps?: ResultActionDeps;
    onDelete?: (id: string) => void | Promise<void>;
    onUndo?: (event: StoredHistoryEvent) => void | Promise<void>;
    onClear?: () => void | Promise<void>;
    direction?: 'ltr' | 'rtl';
    scheduleUndoExpiry?: (dismiss: () => void) => void;
  },
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
      onDelete={extra?.onDelete}
      onUndo={extra?.onUndo}
      onClear={extra?.onClear}
      direction={extra?.direction}
      scheduleUndoExpiry={extra?.scheduleUndoExpiry ?? (() => {})}
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

describe('HistoryScreen (HIS-04)', () => {
  beforeEach(() => {
    setLocale('en');
  });

  test('trailing-edge swipe exposes destructive Delete', () => {
    renderHistory([event({ id: 'url' })]);

    expect(screen.getByTestId('history-row-trailing-right')).toBeTruthy();
    expect(screen.queryByTestId('history-row-delete')).toBeNull();

    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));

    expect(screen.getByTestId('history-row-delete')).toBeTruthy();
    expect(screen.getByLabelText('Delete')).toBeTruthy();
  });

  test('pressing Delete removes the row from the list and offers Undo', () => {
    const onDelete = jest.fn();
    renderHistory([event({ id: 'url', summary: 'example.com/today' })], { onDelete });

    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));
    fireEvent.press(screen.getByTestId('history-row-delete'));

    expect(onDelete).toHaveBeenCalledWith('url');
    expect(screen.queryByText('example.com/today')).toBeNull();
    expect(screen.getByTestId('history-undo')).toBeTruthy();
    expect(screen.getByLabelText('Undo')).toBeTruthy();
  });

  test('full-swipe deletes the selected row', () => {
    const onDelete = jest.fn();
    renderHistory([event({ id: 'url', summary: 'example.com/today' })], { onDelete });

    fireEvent.press(screen.getByTestId('history-row-swipe-full'));

    expect(onDelete).toHaveBeenCalledWith('url');
    expect(screen.queryByText('example.com/today')).toBeNull();
    expect(screen.getByTestId('history-undo')).toBeTruthy();
  });

  test('Undo restores the exact event during the recovery window', () => {
    const onDelete = jest.fn();
    const onUndo = jest.fn();
    const stored = event({
      id: 'url-42',
      acceptedAt: '2026-09-12T17:04:00.000Z',
      kind: 'url',
      summary: 'example.com/today',
      original: 'https://example.com/today',
      parserVersion: PARSER,
    });
    renderHistory([stored], { onDelete, onUndo });

    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));
    fireEvent.press(screen.getByTestId('history-row-delete'));
    expect(screen.queryByText('example.com/today')).toBeNull();

    fireEvent.press(screen.getByTestId('history-undo'));

    expect(onUndo).toHaveBeenCalledWith(stored);
    expect(screen.getByText('example.com/today')).toBeTruthy();
    expect(screen.queryByTestId('history-undo')).toBeNull();
  });

  test('Undo disappears after the recovery window without restoring', () => {
    let dismiss: (() => void) | undefined;
    const onUndo = jest.fn();
    renderHistory([event({ id: 'url', summary: 'example.com/today' })], {
      onUndo,
      scheduleUndoExpiry: (expire) => {
        dismiss = expire;
      },
    });

    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));
    fireEvent.press(screen.getByTestId('history-row-delete'));
    expect(screen.getByTestId('history-undo')).toBeTruthy();

    act(() => {
      dismiss?.();
    });

    expect(screen.queryByTestId('history-undo')).toBeNull();
    expect(screen.queryByText('example.com/today')).toBeNull();
    expect(onUndo).not.toHaveBeenCalled();
  });

  test('Clear History states the affected count and requires destructive confirmation', () => {
    const onClear = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      renderHistory(
        [
          event({ id: 'one', summary: 'example.com/one' }),
          event({
            id: 'two',
            summary: 'example.com/two',
            original: 'https://example.com/two',
          }),
          event({
            id: 'three',
            summary: 'example.com/three',
            original: 'https://example.com/three',
          }),
        ],
        { onClear },
      );

      expect(screen.getByLabelText('Clear 3 scans')).toBeTruthy();
      fireEvent.press(screen.getByTestId('history-clear'));

      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
      expect(title).toBe('Clear all scans?');
      expect(String(message)).toMatch(/3 scans/);
      const confirm = (buttons as { text?: string; style?: string }[] | undefined)?.find(
        (button) => button.style === 'destructive',
      );
      expect(confirm?.text).toBe('Clear All');
      expect(onClear).not.toHaveBeenCalled();
      expect(screen.getByText('example.com/one')).toBeTruthy();
    } finally {
      alertSpy.mockRestore();
    }
  });

  test('canceling Clear History confirmation changes nothing', () => {
    const onClear = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const cancel = buttons?.find((button) => button.style === 'cancel');
      cancel?.onPress?.();
    });
    try {
      renderHistory(
        [
          event({ id: 'one', summary: 'example.com/one' }),
          event({
            id: 'two',
            summary: 'example.com/two',
            original: 'https://example.com/two',
          }),
        ],
        { onClear },
      );

      fireEvent.press(screen.getByTestId('history-clear'));
      expect(onClear).not.toHaveBeenCalled();
      expect(screen.getByText('example.com/one')).toBeTruthy();
      expect(screen.getByText('example.com/two')).toBeTruthy();
      expect(screen.queryByTestId('history-empty')).toBeNull();
    } finally {
      alertSpy.mockRestore();
    }
  });

  test('confirming Clear History removes every row', () => {
    const onClear = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((button) => button.style === 'destructive');
      confirm?.onPress?.();
    });
    try {
      renderHistory(
        [
          event({ id: 'one', summary: 'example.com/one' }),
          event({
            id: 'two',
            summary: 'example.com/two',
            original: 'https://example.com/two',
          }),
        ],
        { onClear },
      );

      fireEvent.press(screen.getByTestId('history-clear'));
      expect(onClear).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('history-empty')).toBeTruthy();
      expect(screen.queryByText('example.com/one')).toBeNull();
    } finally {
      alertSpy.mockRestore();
    }
  });

  test('RTL mirrors the trailing delete edge to the left', () => {
    renderHistory([event({ id: 'url' })], { direction: 'rtl' });

    expect(screen.getByTestId('history-row-trailing-left')).toBeTruthy();
    expect(screen.queryByTestId('history-row-trailing-right')).toBeNull();

    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));
    expect(screen.getByTestId('history-row-delete')).toBeTruthy();
  });

  test('Undo puts the exact row back after the parent list has already dropped it', async () => {
    const stored = event({ id: 'url-42', summary: 'example.com/today' });
    function Harness() {
      const [items, setItems] = useState([stored]);
      return (
        <HistoryScreen
          events={items}
          now={NOW}
          timeZone="UTC"
          locale="en-US"
          scheduleUndoExpiry={() => {}}
          onDelete={(id) => {
            setItems((current) => current.filter((item) => item.id !== id));
          }}
          onUndo={() => {
            // Parent refresh can lag the tap. The row must reappear anyway.
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));
    fireEvent.press(screen.getByTestId('history-row-delete'));
    expect(screen.queryByText('example.com/today')).toBeNull();

    fireEvent.press(screen.getByTestId('history-undo'));
    expect(screen.getByText('example.com/today')).toBeTruthy();
  });

  test('provider actions delete and restore without an events prop', () => {
    const deleteEvent = jest.fn(async () => {});
    const restoreEvent = jest.fn(async () => {});
    const stored = event({ id: 'from-context', summary: 'example.com/from-store' });
    render(
      <HistoryEventsProvider
        events={[stored]}
        actions={{
          deleteEvent,
          restoreEvent,
          clearEvents: jest.fn(async () => {}),
        }}>
        <HistoryScreen
          now={NOW}
          timeZone="UTC"
          locale="en-US"
          scheduleUndoExpiry={() => {}}
        />
      </HistoryEventsProvider>,
    );

    fireEvent.press(screen.getByTestId('history-row-swipe-trailing'));
    fireEvent.press(screen.getByTestId('history-row-delete'));
    expect(deleteEvent).toHaveBeenCalledWith('from-context');

    fireEvent.press(screen.getByTestId('history-undo'));
    expect(restoreEvent).toHaveBeenCalledWith(stored);
  });

  test('Clear History copy is localized and count-aware', () => {
    renderHistory(
      [event({ id: 'one', summary: 'example.com/one' })],
      { locale: 'es' },
    );

    expect(screen.getByLabelText('Borrar 1 escaneo')).toBeTruthy();
  });
});
