import { I18nManager, useWindowDimensions } from 'react-native';

/** Matches UIKit's regular horizontal size class threshold. */
export const REGULAR_WIDTH_BREAKPOINT = 600;

export const COMPACT_GUIDE_SIZE = 200;
/** Cap the center guide so iPad regular widths never get a giant target. */
export const REGULAR_GUIDE_SIZE = 220;
export const MAX_GUIDE_SIZE = 240;

export type HorizontalSizeClass = 'compact' | 'regular';
export type ResultAccessoryPlacement = 'bottom' | 'trailing';

export type AdaptiveLayout = {
  width: number;
  height: number;
  isLandscape: boolean;
  horizontalSizeClass: HorizontalSizeClass;
  guideSize: number;
  resultPlacement: ResultAccessoryPlacement;
  historyColumnCount: 1 | 2;
  isRTL: boolean;
  stickyMaxWidth: number;
};

export function resolveHorizontalSizeClass(width: number): HorizontalSizeClass {
  return width >= REGULAR_WIDTH_BREAKPOINT ? 'regular' : 'compact';
}

export function resolveGuideSize(width: number, height: number): number {
  const shortest = Math.min(width, height);
  if (shortest <= 0) {
    return COMPACT_GUIDE_SIZE;
  }
  const proposed = Math.round(shortest * 0.42);
  const sizeClass = resolveHorizontalSizeClass(width);
  const preferred = sizeClass === 'regular' ? REGULAR_GUIDE_SIZE : COMPACT_GUIDE_SIZE;
  return Math.min(MAX_GUIDE_SIZE, Math.max(160, Math.min(preferred, proposed)));
}

export function resolveResultPlacement(width: number): ResultAccessoryPlacement {
  return resolveHorizontalSizeClass(width) === 'regular' ? 'trailing' : 'bottom';
}

export function buildAdaptiveLayout(input: {
  width: number;
  height: number;
  isRTL?: boolean;
}): AdaptiveLayout {
  const horizontalSizeClass = resolveHorizontalSizeClass(input.width);
  const isLandscape = input.width > input.height;
  return {
    width: input.width,
    height: input.height,
    isLandscape,
    horizontalSizeClass,
    guideSize: resolveGuideSize(input.width, input.height),
    resultPlacement: resolveResultPlacement(input.width),
    historyColumnCount: horizontalSizeClass === 'regular' ? 2 : 1,
    isRTL: input.isRTL ?? I18nManager.isRTL,
    stickyMaxWidth:
      horizontalSizeClass === 'regular'
        ? Math.min(360, Math.round(input.width * 0.38))
        : input.width,
  };
}

export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  return buildAdaptiveLayout({ width, height });
}
