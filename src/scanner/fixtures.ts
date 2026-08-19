import type { Rect } from './types';
import type {
  ScannerClock,
  ScannerEngineID,
  ScannerObservation,
  ScannerObservationSource,
} from './types';
import { SystemScannerClock } from './types';

export type ScannerFixtureDetection = {
  rawPayload: string;
  displayBounds: Rect;
};

export class ScannerObservationFixtureSource
  implements ScannerObservationSource
{
  readonly engineID: ScannerEngineID;
  readonly hasPreview = false;

  private readonly clock: ScannerClock;
  private readonly startupFrame: ScannerFixtureDetection[] | undefined;
  private receiveFrame: ((frame: ScannerObservation[]) => void) | null = null;

  constructor(input: {
    engineID: ScannerEngineID;
    clock?: ScannerClock;
    startupFrame?: ScannerFixtureDetection[];
  }) {
    this.engineID = input.engineID;
    this.clock = input.clock ?? SystemScannerClock;
    this.startupFrame = input.startupFrame;
  }

  start(receiveFrame: (frame: ScannerObservation[]) => void): void {
    this.receiveFrame = receiveFrame;
    if (this.startupFrame) {
      this.emit(this.startupFrame);
    }
  }

  stop(): void {
    this.receiveFrame = null;
  }

  handleLifecycle(): void {}

  emit(detections: ScannerFixtureDetection[]): void {
    const timestamp = this.clock.now;
    this.receiveFrame?.(
      detections.map((detection) => ({
        rawPayload: detection.rawPayload,
        displayBounds: detection.displayBounds,
        timestamp,
        engineID: this.engineID,
      })),
    );
  }
}

export const SINGLE_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'https://example.com/fixture',
    displayBounds: { x: 0.2, y: 0.3, width: 0.6, height: 0.25 },
  },
];

export const EDGE_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'https://example.com/edge-left',
    displayBounds: { x: 0.01, y: 0.4, width: 0.12, height: 0.12 },
  },
  {
    rawPayload: 'https://example.com/edge-right',
    displayBounds: { x: 0.87, y: 0.4, width: 0.12, height: 0.12 },
  },
  {
    rawPayload: 'https://example.com/edge-top',
    displayBounds: { x: 0.44, y: 0.01, width: 0.12, height: 0.12 },
  },
  {
    rawPayload: 'https://example.com/edge-bottom',
    displayBounds: { x: 0.44, y: 0.87, width: 0.12, height: 0.12 },
  },
];
