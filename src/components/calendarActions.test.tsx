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

const VEVENT =
  'BEGIN:VEVENT\nSUMMARY:Team Meeting\nDTSTART:20260912T140000Z\nDTEND:20260912T150000Z\nLOCATION:Room 1\nEND:VEVENT';

function mockDeps(): ResultActionDeps & {
  presentEvent: jest.Mock;
} {
  return {
    openURL: jest.fn(async () => {}),
    copyText: jest.fn(async () => {}),
    shareText: jest.fn(async () => {}),
    presentEvent: jest.fn(async () => 'saved'),
    capabilities: {
      composeEmail: true,
      call: true,
      sendSms: true,
      openLocation: true,
      addContact: true,
      addEvent: true,
    },
  };
}

describe('calendar-event actions (ACT-05)', () => {
  beforeEach(() => {
    setLocale('en');
    (isGlassEffectAPIAvailable as jest.Mock).mockReturnValue(false);
    (isLiquidGlassAvailable as jest.Mock).mockReturnValue(false);
  });

  test('preview shows title, time kind, and location before any Calendar handoff', () => {
    const deps = mockDeps();
    render(<StickyResultBar payload={VEVENT} onClear={() => {}} actionDeps={deps} />);

    expect(screen.getByTestId('sticky-result-event-title').props.children).toBe('Team Meeting');
    expect(screen.getByTestId('sticky-result-event-when').props.children).toContain('UTC');
    expect(screen.getByTestId('sticky-result-event-location').props.children).toBe('Room 1');
    expect(screen.getByLabelText('Add Event')).toBeTruthy();
    expect(deps.presentEvent).not.toHaveBeenCalled();
  });

  test('Add Event requires an explicit tap', async () => {
    const deps = mockDeps();
    render(<StickyResultBar payload={VEVENT} onClear={() => {}} actionDeps={deps} />);
    fireEvent.press(screen.getByLabelText('Add Event'));
    await act(async () => {});
    expect(deps.presentEvent).toHaveBeenCalledTimes(1);
  });

  test('unavailable presentation keeps Copy and Share', () => {
    const deps = mockDeps();
    deps.capabilities!.addEvent = false;
    render(<StickyResultBar payload={VEVENT} onClear={() => {}} actionDeps={deps} />);
    expect(screen.queryByLabelText('Add Event')).toBeNull();
    expect(screen.getByLabelText('Copy')).toBeTruthy();
    expect(screen.getByLabelText('Share')).toBeTruthy();
  });
});
