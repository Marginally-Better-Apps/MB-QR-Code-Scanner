import { render } from '@testing-library/react-native';
import { View } from 'react-native';

import { MultiCodeChooser } from '@/components/MultiCodeChooser';
import type { ScoredMultiCodeCandidate } from '@/scanner/multiCode';

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children, ...props }: { children: unknown }) => {
    const { View: RNView } = require('react-native');
    return <RNView {...props}>{children}</RNView>;
  },
  isGlassEffectAPIAvailable: jest.fn(() => false),
  isLiquidGlassAvailable: jest.fn(() => false),
}));

const mockParseQRPayload = jest.fn((raw: string) => ({
  rawPayload: raw,
  content: { kind: 'url' as const },
  displaySummary: raw,
}));

jest.mock('@/scanner/payloadParser', () => {
  const actual = jest.requireActual('@/scanner/payloadParser');
  return {
    ...actual,
    parseQRPayload: (...args: [string]) => mockParseQRPayload(...args),
  };
});

jest.mock('@/components/chromeAppearance', () => {
  const { View: RNView } = require('react-native');
  return {
    chromeContainerStyle: () => ({}),
    resolveChromeSurface: () => ({ kind: 'standard' }),
    useChromePreferences: () => ({}),
    ChromeAppearanceProvider: ({ children }: { children: unknown }) => children,
    __esModule: true,
    default: ({ children }: { children: unknown }) => <RNView>{children}</RNView>,
  };
});

function candidates(): ScoredMultiCodeCandidate[] {
  return [
    {
      id: 'https://example.com/left',
      rawPayload: 'https://example.com/left',
      bounds: { x: 0.05, y: 0.4, width: 0.15, height: 0.15 },
      score: 1,
      stability: 2,
    },
    {
      id: 'https://example.com/right',
      rawPayload: 'https://example.com/right',
      bounds: { x: 0.8, y: 0.4, width: 0.15, height: 0.15 },
      score: 1,
      stability: 2,
    },
  ];
}

describe('multi-code chooser parsing stays off the high-rate render path (QLT-04)', () => {
  beforeEach(() => {
    mockParseQRPayload.mockClear();
  });

  test('re-renders with unchanged candidates do not re-parse payloads', () => {
    const first = render(
      <View>
        <MultiCodeChooser candidates={candidates()} onSelect={() => {}} />
      </View>,
    );
    const callsAfterFirstRender = mockParseQRPayload.mock.calls.length;
    expect(callsAfterFirstRender).toBeGreaterThan(0);

    // A new array identity with identical contents arrives on the next
    // metadata frame; parsing must not redo work for the same payloads.
    first.rerender(
      <View>
        <MultiCodeChooser candidates={candidates()} onSelect={() => {}} />
      </View>,
    );
    first.rerender(
      <View>
        <MultiCodeChooser candidates={candidates()} onSelect={() => {}} />
      </View>,
    );

    expect(mockParseQRPayload.mock.calls.length).toBe(callsAfterFirstRender);
    first.unmount();
  });
});
