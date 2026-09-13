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

const VCARD =
  'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nORG:Acme Labs\nTEL:+14155552671\nEMAIL:jane@example.com\nEND:VCARD';

function mockDeps(): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
  presentContact: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    canOpenURL: jest.fn(async () => true),
    presentContact: jest.fn(async () => 'saved'),
    capabilities: {
      composeEmail: true,
      call: true,
      sendSms: true,
      openLocation: true,
      addContact: true,
    },
  };
}

describe('contact-card actions (ACT-04)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('preview shows the contact summary before any Contacts handoff', () => {
    const deps = mockDeps();
    render(<StickyResultBar payload={VCARD} onClear={() => {}} actionDeps={deps} />);

    expect(screen.getByTestId('sticky-result-contact-name').props.children).toBe('Jane Doe');
    expect(screen.getByTestId('sticky-result-contact-org').props.children).toBe('Acme Labs');
    expect(screen.getByTestId('sticky-result-contact-phone').props.children).toBe(
      '+1 415 555 2671',
    );
    expect(screen.getByTestId('sticky-result-contact-email').props.children).toBe(
      'jane@example.com',
    );
    expect(screen.getByLabelText('Add Contact')).toBeTruthy();
    expect(deps.presentContact).not.toHaveBeenCalled();
  });

  test('Add Contact requires an explicit tap and uses the injected system presenter', async () => {
    const deps = mockDeps();
    render(<StickyResultBar payload={VCARD} onClear={() => {}} actionDeps={deps} />);

    fireEvent.press(screen.getByLabelText('Add Contact'));
    await act(async () => {});
    expect(deps.presentContact).toHaveBeenCalledTimes(1);
    expect(deps.presentContact.mock.calls[0][0].originalPayload).toBe(VCARD);
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('unavailable presentation keeps Copy and Share and hides the primary action', () => {
    const deps = mockDeps();
    deps.capabilities.addContact = false;
    render(<StickyResultBar payload={VCARD} onClear={() => {}} actionDeps={deps} />);

    expect(screen.queryByLabelText('Add Contact')).toBeNull();
    expect(screen.getByLabelText('Copy')).toBeTruthy();
    expect(screen.getByLabelText('Share')).toBeTruthy();
  });
});
