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

function mockDeps(overrides?: Partial<ResultActionDeps>): ResultActionDeps & {
  openURL: jest.Mock;
  copyText: jest.Mock;
  shareText: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    canOpenURL: jest.fn(async () => true),
    ...overrides,
  };
}

describe('custom handoff presentation (ACT-09)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('scheme plus resolved app name render when the system exposes it', async () => {
    const deps = mockDeps({ getAppNameForURL: async () => 'Acme Pay' });
    render(
      <StickyResultBar
        payload="acmetest://pay?amount=10&to=bob"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );
    await act(async () => {});

    expect(screen.getByTestId('sticky-result-scheme').props.children).toMatch(/acmetest/);
    expect(screen.getByTestId('sticky-result-app-name').props.children).toBe('Acme Pay');
    expect(screen.queryByTestId('sticky-result-url')).toBeNull();
    // Open label names the resolved app; nothing opened on render.
    expect(screen.getByLabelText('Open in Acme Pay')).toBeTruthy();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('uninstalled destinations hide Open but retain raw Copy and Share', async () => {
    const deps = mockDeps({ canOpenURL: async () => false });
    render(
      <StickyResultBar
        payload="acmetest://pay?amount=10&to=bob"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );
    await act(async () => {});

    expect(screen.getByTestId('sticky-result-scheme')).toBeTruthy();
    expect(screen.queryByTestId('sticky-result-open')).toBeNull();
    expect(screen.getByTestId('sticky-result-app-unavailable')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-share')).toBeTruthy();
    expect(deps.openURL).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('sticky-result-copy'));
    await act(async () => {});
    expect(deps.copyText).toHaveBeenCalledWith('acmetest://pay?amount=10&to=bob');

    fireEvent.press(screen.getByTestId('sticky-result-share'));
    await act(async () => {});
    expect(deps.shareText).toHaveBeenCalledWith('acmetest://pay?amount=10&to=bob');
  });

  test('payment handoffs show an unverified note and open only on tap', async () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="bitcoin:bc1qexampleaddress123?amount=0.001"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );
    await act(async () => {});

    expect(screen.getByTestId('sticky-result-scheme').props.children).toMatch(/bitcoin/);
    const note = screen.getByTestId('sticky-result-payment-note');
    expect(String(note.props.children)).toMatch(/not verified/i);
    expect(String(note.props.children)).not.toMatch(/verified by/i);
    expect(deps.openURL).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('sticky-result-open'));
    await act(async () => {});
    expect(deps.openURL).toHaveBeenCalledWith('bitcoin:bc1qexampleaddress123?amount=0.001');
  });
});
