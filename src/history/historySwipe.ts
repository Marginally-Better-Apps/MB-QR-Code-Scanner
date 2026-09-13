export type LayoutDirection = 'ltr' | 'rtl';
export type HorizontalEdge = 'left' | 'right';

export function layoutDirection(isRTL: boolean): LayoutDirection {
  return isRTL ? 'rtl' : 'ltr';
}

export function trailingEdge(direction: LayoutDirection): HorizontalEdge {
  return direction === 'rtl' ? 'left' : 'right';
}
