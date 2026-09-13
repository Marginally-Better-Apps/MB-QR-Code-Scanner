import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { StickyResultBar } from '@/components/StickyResultBar';
import { setLocale } from '@/i18n';
import type { ResultActionDeps } from '@/scanner/actionRouter';
import { AUTH_QR_FIXTURES } from '@/scanner/authQr';

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

function mockDeps(canOpen = true): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
  canOpenURL: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    canOpenURL: jest.fn(async () => canOpen),
  };
}

describe('verified auth QR actions (ACT-08)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('otpauth shows Open Passwords only when canOpenURL is true and never copies', async () => {
    const deps = mockDeps(true);
    render(
      <StickyResultBar
        payload={AUTH_QR_FIXTURES.otpauthTotp}
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(screen.getByText('Authentication code (Example)')).toBeTruthy();
    expect(screen.queryByText(AUTH_QR_FIXTURES.otpauthSecret)).toBeNull();
    expect(screen.queryByText(AUTH_QR_FIXTURES.otpauthTotp)).toBeNull();
    expect(screen.queryByTestId('sticky-result-copy')).toBeNull();
    expect(screen.queryByTestId('sticky-result-share')).toBeNull();
    expect(screen.queryByText(/Authenticate/i)).toBeNull();

    await waitFor(() => {
      expect(screen.getByLabelText('Open Passwords')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Open Passwords'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledWith(AUTH_QR_FIXTURES.otpauthTotp);
    expect(deps.copyText).not.toHaveBeenCalled();
    expect(deps.shareText).not.toHaveBeenCalled();
  });

  test('otpauth explains the gap and hides the button when canOpenURL is false', async () => {
    const deps = mockDeps(false);
    render(
      <StickyResultBar
        payload={AUTH_QR_FIXTURES.otpauthTotp}
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Passwords is not available for this code on this device.'),
      ).toBeTruthy();
    });
    expect(screen.queryByLabelText('Open Passwords')).toBeNull();
    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('authenticator exports explain the refusal and offer no handoff', async () => {
    const deps = mockDeps(true);
    render(
      <StickyResultBar
        payload={AUTH_QR_FIXTURES.otpMigration}
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(screen.getByText('Authenticator export')).toBeTruthy();
    expect(
      screen.getByText(
        'This is an authenticator export. The app will not import or forward it.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(screen.queryByTestId('sticky-result-copy')).toBeNull();
    expect(screen.queryByTestId('sticky-result-share')).toBeNull();
    expect(screen.queryByText(AUTH_QR_FIXTURES.otpMigrationData)).toBeNull();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('FIDO hybrid confirms nearby-device handoff then openURLs the raw payload', async () => {
    const deps = mockDeps(true);
    render(
      <StickyResultBar
        payload={AUTH_QR_FIXTURES.fidoHybrid}
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(screen.getByText('Passkey sign-in')).toBeTruthy();
    expect(screen.queryByText(AUTH_QR_FIXTURES.fidoDigits)).toBeNull();
    await waitFor(() => {
      expect(screen.getByLabelText('Connect nearby device')).toBeTruthy();
    });
    expect(
      screen.getByText(
        'The system will ask to connect to the nearby device. Bluetooth must be on.',
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Connect nearby device'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledWith(AUTH_QR_FIXTURES.fidoHybrid);
    expect(deps.copyText).not.toHaveBeenCalled();
  });

  test('FIDO hybrid falls back to Camera copy with no dead button', async () => {
    const deps = mockDeps(false);
    render(
      <StickyResultBar
        payload={AUTH_QR_FIXTURES.fidoHybrid}
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('The Camera app can still handle passkey QR codes.'),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(screen.queryByLabelText('Connect nearby device')).toBeNull();
    expect(deps.openURL).not.toHaveBeenCalled();
  });
});
