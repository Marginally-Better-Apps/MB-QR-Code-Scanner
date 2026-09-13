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

const WIFI = 'WIFI:T:WPA;S:HomeNet;P:supersecret;;';

function mockDeps(joinAvailable = true): ResultActionDeps & { joinWifi: jest.Mock } {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    joinWifi: jest.fn(async () => 'joined'),
    capabilities: {
      composeEmail: true,
      call: true,
      sendSms: true,
      openLocation: true,
      addContact: true,
      addEvent: true,
      joinWifi: joinAvailable,
    },
  };
}

describe('Wi-Fi actions (ACT-06)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('preview names the SSID and security and masks the password', () => {
    const deps = mockDeps();
    render(<StickyResultBar payload={WIFI} onClear={() => {}} actionDeps={deps} />);

    expect(screen.getByTestId('sticky-result-wifi-ssid').props.children).toBe('HomeNet');
    expect(screen.getByTestId('sticky-result-wifi-security').props.children).toBe('WPA');
    expect(screen.getByTestId('sticky-result-wifi-password').props.children).toBe('••••••••');
    expect(screen.getByLabelText('Password hidden')).toBeTruthy();
    expect(screen.queryByText('supersecret')).toBeNull();
    expect(deps.joinWifi).not.toHaveBeenCalled();
  });

  test('Join requires an explicit tap', async () => {
    const deps = mockDeps(true);
    render(<StickyResultBar payload={WIFI} onClear={() => {}} actionDeps={deps} />);
    fireEvent.press(screen.getByLabelText('Join'));
    await act(async () => {});
    expect(deps.joinWifi).toHaveBeenCalledTimes(1);
    expect(deps.joinWifi.mock.calls[0][0].ssid).toBe('HomeNet');
  });

  test('unavailable join explains the limit and keeps Copy and Share', () => {
    const deps = mockDeps(false);
    render(<StickyResultBar payload={WIFI} onClear={() => {}} actionDeps={deps} />);
    expect(screen.queryByLabelText('Join')).toBeNull();
    expect(screen.getByTestId('sticky-result-wifi-unavailable')).toBeTruthy();
    expect(screen.getByLabelText('Copy')).toBeTruthy();
    expect(screen.getByLabelText('Share')).toBeTruthy();
  });
});
