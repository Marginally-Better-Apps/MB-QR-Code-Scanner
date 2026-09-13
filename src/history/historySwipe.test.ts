import { I18nManager } from 'react-native';

import { layoutDirection, trailingEdge } from './historySwipe';

describe('history swipe edges (HIS-04)', () => {
  test('LTR trailing edge is the right side', () => {
    expect(trailingEdge('ltr')).toBe('right');
    expect(layoutDirection(false)).toBe('ltr');
  });

  test('RTL trailing edge mirrors to the left side', () => {
    expect(trailingEdge('rtl')).toBe('left');
    expect(layoutDirection(true)).toBe('rtl');
  });

  test('layout direction follows I18nManager.isRTL', () => {
    const original = I18nManager.isRTL;
    try {
      Object.defineProperty(I18nManager, 'isRTL', { configurable: true, value: true });
      expect(layoutDirection(I18nManager.isRTL)).toBe('rtl');
      expect(trailingEdge(layoutDirection(I18nManager.isRTL))).toBe('left');

      Object.defineProperty(I18nManager, 'isRTL', { configurable: true, value: false });
      expect(layoutDirection(I18nManager.isRTL)).toBe('ltr');
      expect(trailingEdge(layoutDirection(I18nManager.isRTL))).toBe('right');
    } finally {
      Object.defineProperty(I18nManager, 'isRTL', { configurable: true, value: original });
    }
  });
});
