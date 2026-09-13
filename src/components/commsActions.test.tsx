import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { StickyResultBar } from '@/components/StickyResultBar';
import { setLocale } from '@/i18n';
import type { ResultActionDeps } from '@/scanner/actionRouter';

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

function mockDeps(): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    canOpenURL: jest.fn(async () => true),
    capabilities: {
      composeEmail: true,
      call: true,
      sendSms: true,
      openLocation: true,
    },
  };
}

describe('email, phone, SMS, and location actions (ACT-03)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('email preview shows destination and prefilled content before any handoff', () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="mailto:alice@example.com?subject=Hello&body=See%20you%20at%208"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(screen.getByTestId('sticky-result-email-to').props.children).toBe(
      'To alice@example.com',
    );
    expect(screen.getByTestId('sticky-result-email-subject').props.children).toBe(
      'Subject Hello',
    );
    expect(screen.getByTestId('sticky-result-email-body').props.children).toBe(
      'Body See you at 8',
    );
    expect(screen.getByLabelText('Compose')).toBeTruthy();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('phone preview normalizes the number and calls only after an explicit tap', async () => {
    const deps = mockDeps();
    const raw = 'tel:+1 (415) 555-2671';
    render(<StickyResultBar payload={raw} onClear={() => {}} actionDeps={deps} />);

    expect(screen.getByTestId('sticky-result-phone').props.children).toBe('+1 415 555 2671');
    expect(screen.getByTestId('sticky-result-payload').props.children).toBe(raw);
    expect(deps.openURL).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Call'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith('tel:+14155552671');
  });

  test('SMS preview shows the recipient and body, then messages only after a tap', async () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="sms:+14155552671?body=Running%20late"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(screen.getByTestId('sticky-result-sms-number').props.children).toBe(
      '+1 415 555 2671',
    );
    expect(screen.getByTestId('sticky-result-sms-body').props.children).toBe('Running late');
    expect(deps.openURL).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Message'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledWith('sms:+14155552671&body=Running%20late');
  });

  test('geo preview shows coordinates and query, then opens Maps after a tap', async () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="geo:37.7749,-122.4194?q=Ferry+Building"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(screen.getByTestId('sticky-result-geo-coords').props.children).toBe(
      '37.7749, -122.4194',
    );
    expect(screen.getByTestId('sticky-result-geo-query').props.children).toBe('Ferry Building');
    expect(deps.openURL).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Open Map'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledWith(
      'http://maps.apple.com/?ll=37.7749,-122.4194&q=Ferry%20Building',
    );
  });

  test('unavailable capabilities hide the primary action and keep copy and share', async () => {
    const cases = [
      {
        raw: 'mailto:alice@example.com?subject=Hi',
        capabilities: { composeEmail: false },
      },
      { raw: 'tel:+14155552671', capabilities: { call: false } },
      { raw: 'sms:+14155552671?body=Hi', capabilities: { sendSms: false } },
      { raw: 'geo:37.7749,-122.4194', capabilities: { openLocation: false } },
    ];

    for (const { raw, capabilities } of cases) {
      const deps = mockDeps();
      const view = render(
        <StickyResultBar
          payload={raw}
          onClear={() => {}}
          actionDeps={deps}
          actionCapabilities={capabilities}
        />,
      );

      expect(screen.queryByTestId('sticky-result-open')).toBeNull();
      expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
      expect(screen.getByTestId('sticky-result-share')).toBeTruthy();
      expect(deps.openURL).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('sticky-result-copy'));
      await act(async () => {});
      expect(deps.copyText).toHaveBeenCalledWith(raw);

      fireEvent.press(screen.getByTestId('sticky-result-share'));
      await act(async () => {});
      expect(deps.shareText).toHaveBeenCalledWith(raw);

      view.unmount();
    }
  });

  test('malformed structured payloads keep the raw value and only copy or share', () => {
    const deps = mockDeps();
    render(<StickyResultBar payload="geo:999,999" onClear={() => {}} actionDeps={deps} />);

    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(screen.getByTestId('sticky-result-payload').props.children).toContain('geo:999,999');
    expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-share')).toBeTruthy();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('email compose happens only after an explicit tap', async () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="mailto:alice@example.com?subject=Hello&body=World"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(deps.openURL).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Compose'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(String(deps.openURL.mock.calls[0][0])).toMatch(/^mailto:alice@example\.com\?/);
  });

  test('comms actions are localized', () => {
    setLocale('es');
    const deps = mockDeps();
    try {
      const { rerender } = render(
        <StickyResultBar
          payload="mailto:alice@example.com?subject=Hola"
          onClear={() => {}}
          actionDeps={deps}
        />,
      );
      expect(screen.getByLabelText('Redactar')).toBeTruthy();
      expect(screen.getByText(/Para alice@example.com/)).toBeTruthy();

      rerender(
        <StickyResultBar payload="tel:+14155552671" onClear={() => {}} actionDeps={deps} />,
      );
      expect(screen.getByLabelText('Llamar')).toBeTruthy();

      rerender(
        <StickyResultBar
          payload="sms:+14155552671?body=Hola"
          onClear={() => {}}
          actionDeps={deps}
        />,
      );
      expect(screen.getByLabelText('Mensaje')).toBeTruthy();

      rerender(
        <StickyResultBar payload="geo:37.7749,-122.4194" onClear={() => {}} actionDeps={deps} />,
      );
      expect(screen.getByLabelText('Abrir mapa')).toBeTruthy();
    } finally {
      setLocale('en');
    }
  });
});
