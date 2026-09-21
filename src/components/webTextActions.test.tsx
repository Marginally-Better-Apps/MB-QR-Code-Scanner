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
  };
}

describe('web links and plain text actions (ACT-02)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('web result stays on one clean line with full details available on demand', () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="https://EXAMPLE.com/Some/Path?q=1"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    const url = screen.getByTestId('sticky-result-url');
    expect(url.props.children).toBe('https://example.com/Some/Path?q=1');
    expect(url.props.numberOfLines).toBe(1);
    expect(url.props.ellipsizeMode).toBe('middle');

    expect(screen.queryByTestId('sticky-result-path')).toBeNull();
    fireEvent.press(screen.getByTestId('sticky-result-expand'));
    expect(screen.getByTestId('sticky-result-detail')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-full-payload')).toBeTruthy();
  });

  test('long paths cannot break layout', () => {
    const deps = mockDeps();
    const raw = `https://example.com/${'a'.repeat(2000)}`;
    render(<StickyResultBar payload={raw} onClear={() => {}} actionDeps={deps} />);

    const url = screen.getByTestId('sticky-result-url');
    expect(url.props.numberOfLines).toBe(1);
    expect(url.props.ellipsizeMode).toBe('middle');
    expect(url.props.children.length).toBeLessThan(raw.length);
    expect(url.props.children).toMatch(/…/);
  });

  test('unicode hosts render as punycode and hostile text cannot impersonate UI', () => {
    const deps = mockDeps();
    const { rerender } = render(
      <StickyResultBar
        payload="https://münchen.de/Grüße"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );
    expect(screen.getByTestId('sticky-result-url').props.children).toMatch(/xn--/);

    rerender(
      <StickyResultBar
        payload={'https://example.com/\nFake Button'}
        onClear={() => {}}
        actionDeps={deps}
      />,
    );
    // Falls back to text: no website host styling, no embedded newline.
    expect(screen.queryByTestId('sticky-result-url')).toBeNull();
    const payload = screen.getByTestId('sticky-result-payload');
    expect(String(payload.props.children)).not.toMatch(/[\n\r]/);
  });

  test('rendering never opens automatically and makes no network request', () => {
    const deps = mockDeps();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no net'));
    try {
      render(
        <StickyResultBar
          payload="https://example.com/do-not-auto-open"
          onClear={() => {}}
          actionDeps={deps}
        />,
      );
      expect(deps.openURL).not.toHaveBeenCalled();
      expect(deps.copyText).not.toHaveBeenCalled();
      expect(deps.shareText).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('open requires an explicit tap and uses system routing', () => {
    const deps = mockDeps();
    render(
      <StickyResultBar
        payload="https://example.com/tap-to-open?q=1"
        onClear={() => {}}
        actionDeps={deps}
      />,
    );

    expect(deps.openURL).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('sticky-result-open'));
    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\/tap-to-open/),
    );
  });

  test('plain text and every URL form offer copy and share', async () => {
    for (const raw of [
      'Hello plain text',
      'https://example.com/a?x=1',
      'http://example.com/plain-http',
      'myapp://pay?amount=10',
    ]) {
      const deps = mockDeps();
      const view = render(<StickyResultBar payload={raw} onClear={() => {}} actionDeps={deps} />);
      expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
      expect(screen.getByTestId('sticky-result-share')).toBeTruthy();

      fireEvent.press(screen.getByTestId('sticky-result-copy'));
      await act(async () => {});
      expect(deps.copyText).toHaveBeenCalledWith(raw);

      fireEvent.press(screen.getByTestId('sticky-result-share'));
      await act(async () => {});
      expect(deps.shareText).toHaveBeenCalledWith(raw);

      view.unmount();
    }
  });

  test('custom schemes are labeled by scheme and never styled as websites', () => {
    const deps = mockDeps();
    render(
      <StickyResultBar payload="myapp://pay?amount=10&to=bob" onClear={() => {}} actionDeps={deps} />,
    );

    expect(screen.getByTestId('sticky-result-scheme').props.children).toMatch(/myapp/);
    expect(screen.queryByTestId('sticky-result-url')).toBeNull();
    // Still copyable/shareable.
    expect(screen.getByTestId('sticky-result-copy')).toBeTruthy();
    expect(screen.getByTestId('sticky-result-share')).toBeTruthy();
  });

  test('actions are localized', () => {
    setLocale('es');
    const deps = mockDeps();
    try {
      render(
        <StickyResultBar
          payload="https://example.com/hola"
          onClear={() => {}}
          actionDeps={deps}
        />,
      );
      expect(screen.getByLabelText('Abrir enlace')).toBeTruthy();
      expect(screen.getByLabelText('Copiar')).toBeTruthy();
      expect(screen.getByLabelText('Compartir')).toBeTruthy();
    } finally {
      setLocale('en');
    }
  });
});
