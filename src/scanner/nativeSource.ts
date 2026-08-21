import type { Rect } from './types';
import type {
  ScannerEngineID,
  ScannerLifecyclePhase,
  ScannerObservation,
  ScannerObservationSource,
} from './types';
import { ScannerRecognitionRegion } from './geometry';

export type NativeBarcodeEvent = {
  payload: string | null;
  displayBounds: Rect;
};

type ObservationListener = (frame: ScannerObservation[]) => void;

const listeners = new Set<ObservationListener>();

export function publishNativeObservations(
  engineID: ScannerEngineID,
  items: NativeBarcodeEvent[],
  timestamp = new Date(),
): void {
  const frame = items.flatMap((item) => {
    if (item.payload == null) {
      return [];
    }
    if (!ScannerRecognitionRegion.containsVisibleCode(item.displayBounds)) {
      return [];
    }
    return [
      {
        rawPayload: item.payload,
        displayBounds: item.displayBounds,
        timestamp,
        engineID,
      } satisfies ScannerObservation,
    ];
  });
  for (const listener of listeners) {
    listener(frame);
  }
}

export function nativeObservationItems(event: unknown): NativeBarcodeEvent[] {
  if (event == null || typeof event !== 'object') {
    return [];
  }
  const record = event as {
    nativeEvent?: { items?: NativeBarcodeEvent[] };
    items?: NativeBarcodeEvent[];
  };
  const items = record.nativeEvent?.items ?? record.items;
  return Array.isArray(items) ? items : [];
}

export class NativeEngineObservationSource implements ScannerObservationSource {
  readonly engineID: ScannerEngineID;
  hasPreview = true;
  private receiveFrame: ObservationListener | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(engineID: ScannerEngineID) {
    this.engineID = engineID;
  }

  start(receiveFrame: ObservationListener): void {
    this.receiveFrame = receiveFrame;
    this.unsubscribe = () => listeners.delete(this.deliver);
    listeners.add(this.deliver);
  }

  stop(): void {
    this.receiveFrame = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  handleLifecycle(_phase: ScannerLifecyclePhase): void {}

  private deliver = (frame: ScannerObservation[]): void => {
    this.receiveFrame?.(frame);
  };
}
