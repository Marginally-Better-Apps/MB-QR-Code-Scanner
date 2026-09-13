import {
  MAX_GUIDE_SIZE,
  REGULAR_GUIDE_SIZE,
  REGULAR_WIDTH_BREAKPOINT,
  buildAdaptiveLayout,
  resolveGuideSize,
  resolveHorizontalSizeClass,
  resolveResultPlacement,
} from '@/components/adaptiveLayout';

describe('adaptiveLayout resolvers (QLT-03)', () => {
  test('regular width starts at the UIKit size-class threshold', () => {
    expect(REGULAR_WIDTH_BREAKPOINT).toBe(600);
    expect(resolveHorizontalSizeClass(599)).toBe('compact');
    expect(resolveHorizontalSizeClass(600)).toBe('regular');
  });

  test('narrow layouts use a bottom result accessory', () => {
    expect(resolveResultPlacement(390)).toBe('bottom');
    expect(resolveResultPlacement(599)).toBe('bottom');
  });

  test('wide layouts use a trailing inspector accessory', () => {
    expect(resolveResultPlacement(600)).toBe('trailing');
    expect(resolveResultPlacement(1024)).toBe('trailing');
  });

  test('guide never grows into a giant iPad target', () => {
    expect(REGULAR_GUIDE_SIZE).toBeLessThanOrEqual(240);
    expect(MAX_GUIDE_SIZE).toBeLessThanOrEqual(240);
    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
      [1366, 1024],
    ] as const) {
      expect(resolveGuideSize(width, height)).toBeLessThanOrEqual(240);
      expect(resolveGuideSize(width, height)).toBeGreaterThanOrEqual(160);
    }
  });

  test('compact iPhone guide stays comfortably sized', () => {
    const size = resolveGuideSize(390, 844);
    expect(size).toBeGreaterThanOrEqual(160);
    expect(size).toBeLessThanOrEqual(200);
  });

  test('layout matrix covers portrait, landscape, Split View, and Stage Manager widths', () => {
    // iPhone portrait: compact, bottom sheet, single column.
    expect(
      buildAdaptiveLayout({ width: 390, height: 844, isRTL: false }),
    ).toEqual(
      expect.objectContaining({
        horizontalSizeClass: 'compact',
        resultPlacement: 'bottom',
        historyColumnCount: 1,
        isLandscape: false,
      }),
    );
    // iPhone landscape: width crosses the regular threshold.
    expect(
      buildAdaptiveLayout({ width: 844, height: 390, isRTL: false }),
    ).toEqual(
      expect.objectContaining({
        horizontalSizeClass: 'regular',
        resultPlacement: 'trailing',
        historyColumnCount: 2,
        isLandscape: true,
      }),
    );
    // iPad portrait and landscape: regular, capped guide.
    for (const [width, height] of [[768, 1024], [1024, 768]] as const) {
      const layout = buildAdaptiveLayout({ width, height, isRTL: false });
      expect(layout.horizontalSizeClass).toBe('regular');
      expect(layout.resultPlacement).toBe('trailing');
      expect(layout.historyColumnCount).toBe(2);
      expect(layout.guideSize).toBeLessThanOrEqual(240);
    }
    // iPad Split View narrow width: compact single column.
    expect(
      buildAdaptiveLayout({ width: 560, height: 768, isRTL: false }),
    ).toEqual(
      expect.objectContaining({
        horizontalSizeClass: 'compact',
        resultPlacement: 'bottom',
        historyColumnCount: 1,
      }),
    );
    // Stage Manager mid width: regular two columns.
    expect(
      buildAdaptiveLayout({ width: 800, height: 600, isRTL: false }),
    ).toEqual(
      expect.objectContaining({
        horizontalSizeClass: 'regular',
        historyColumnCount: 2,
      }),
    );
  });

  test('trailing inspector width stays readable without covering the target', () => {
    const layout = buildAdaptiveLayout({ width: 1024, height: 768 });
    expect(layout.stickyMaxWidth).toBeLessThanOrEqual(360);
    expect(layout.stickyMaxWidth).toBeLessThan(1024 / 2);
  });

  test('RTL flag flows through the layout', () => {
    expect(buildAdaptiveLayout({ width: 390, height: 844, isRTL: true }).isRTL).toBe(
      true,
    );
    expect(
      buildAdaptiveLayout({ width: 390, height: 844, isRTL: false }).isRTL,
    ).toBe(false);
  });
});
