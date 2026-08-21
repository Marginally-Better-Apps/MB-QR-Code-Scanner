import type { Point, Rect, Size } from './types';
import type { ScannerEngineID, ScannerObservation } from './types';

export const ScannerRecognitionRegion = {
  fullPreview: { x: 0, y: 0, width: 1, height: 1 } satisfies Rect,

  containsVisibleCode(bounds: Rect): boolean {
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      rectsIntersect(bounds, this.fullPreview)
    );
  },
};

export const ScannerPreviewPresentation = {
  aspectFillGravity: 'AVLayerVideoGravityResizeAspectFill',
};

export type CaptureOrientation =
  | 'portrait'
  | 'portraitUpsideDown'
  | 'landscapeLeft'
  | 'landscapeRight';

export function videoOrientationForInterface(
  interfaceOrientation: CaptureOrientation | 'unknown',
): CaptureOrientation {
  switch (interfaceOrientation) {
    case 'portrait':
    case 'portraitUpsideDown':
    case 'landscapeLeft':
    case 'landscapeRight':
      return interfaceOrientation;
    default:
      return 'portrait';
  }
}

export type ScannerPreviewHitTarget = 'camera' | 'resultAction';

export function hitTarget(
  point: Point,
  resultActionRect: Rect | null | undefined,
): ScannerPreviewHitTarget {
  if (resultActionRect && rectContains(resultActionRect, point)) {
    return 'resultAction';
  }
  return 'camera';
}

export function zoomFactor(
  base: number,
  scale: number,
  minFactor: number,
  maxFactor: number,
): number {
  return Math.min(maxFactor, Math.max(minFactor, base * scale));
}

export function normalizedBounds(bounds: Rect, viewSize: Size): Rect {
  if (viewSize.width <= 0 || viewSize.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: bounds.x / viewSize.width,
    y: bounds.y / viewSize.height,
    width: bounds.width / viewSize.width,
    height: bounds.height / viewSize.height,
  };
}

export function boundingRect(
  topLeft: Point,
  topRight: Point,
  bottomRight: Point,
  bottomLeft: Point,
): Rect {
  const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
  const maxX = Math.max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
  const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
  const maxY = Math.max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function mapObservation(input: {
  payload: string | null | undefined;
  bounds: Rect;
  viewSize: Size;
  timestamp: Date;
  engineID: ScannerEngineID;
}): ScannerObservation | null {
  if (input.payload == null) {
    return null;
  }

  const displayBounds = normalizedBounds(input.bounds, input.viewSize);
  if (!ScannerRecognitionRegion.containsVisibleCode(displayBounds)) {
    return null;
  }

  return {
    rawPayload: input.payload,
    displayBounds,
    timestamp: input.timestamp,
    engineID: input.engineID,
  };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
