import { ScannerRecognitionRegion } from './geometry';
import { mapObservation } from './geometry';
import type { Rect, Size } from './types';
import type {
  ScannerClock,
  ScannerEngineID,
  ScannerLifecyclePhase,
  ScannerObservation,
  ScannerObservationSource,
} from './types';
import { QR_BARCODE_SYMBOLOGY, SystemScannerClock } from './types';

export type VisionKitScannerConfiguration = {
  barcodeSymbologies: string[];
  recognizesMultipleItems: boolean;
  isHighFrameRateTrackingEnabled: boolean;
  isGuidanceEnabled: boolean;
  isHighlightingEnabled: boolean;
  recognitionRegion: Rect;
};

export type VisionKitRecognizedBarcode = {
  payload: string | null;
  bounds: Rect;
};

export type VisionKitScannerControlling = {
  isScanning: boolean;
  viewSize: Size;
  hasPreview: boolean;
  startScanning(): void;
  stopScanning(): void;
};

export type VisionKitScannerEventSink = {
  visionKitScannerDidAdd(
    items: VisionKitRecognizedBarcode[],
    allItems: VisionKitRecognizedBarcode[],
  ): void;
  visionKitScannerDidUpdate(
    items: VisionKitRecognizedBarcode[],
    allItems: VisionKitRecognizedBarcode[],
  ): void;
  visionKitScannerDidRemove(
    items: VisionKitRecognizedBarcode[],
    allItems: VisionKitRecognizedBarcode[],
  ): void;
};

export type VisionKitScannerPlatform = {
  isSupported: boolean;
  isAvailable: boolean;
  makeController(
    configuration: VisionKitScannerConfiguration,
    eventSink: VisionKitScannerEventSink,
  ): VisionKitScannerControlling;
};

export const visionKitProductConfiguration: VisionKitScannerConfiguration = {
  barcodeSymbologies: [QR_BARCODE_SYMBOLOGY],
  recognizesMultipleItems: true,
  isHighFrameRateTrackingEnabled: true,
  isGuidanceEnabled: false,
  isHighlightingEnabled: false,
  recognitionRegion: ScannerRecognitionRegion.fullPreview,
};

export class VisionKitScannerObservationSource
  implements ScannerObservationSource, VisionKitScannerEventSink
{
  readonly engineID: ScannerEngineID = 'visionkit';
  readonly usesCustomCameraGestures = false;

  static readonly productConfiguration = visionKitProductConfiguration;

  private readonly platform: VisionKitScannerPlatform;
  private readonly clock: ScannerClock;
  private controller: VisionKitScannerControlling | null = null;
  private receiveFrame: ((frame: ScannerObservation[]) => void) | null = null;

  constructor(
    platform?: VisionKitScannerPlatform,
    clock: ScannerClock = SystemScannerClock,
  ) {
    this.platform = platform ?? {
      isSupported: false,
      isAvailable: false,
      makeController() {
        throw new Error('VisionKit platform is not available');
      },
    };
    this.clock = clock;
  }

  get hasPreview(): boolean {
    return this.controller?.hasPreview === true;
  }

  start(receiveFrame: (frame: ScannerObservation[]) => void): void {
    this.receiveFrame = receiveFrame;
    this.startScanningIfPossible();
  }

  stop(): void {
    this.receiveFrame = null;
    this.stopScanningIfNeeded();
  }

  handleLifecycle(phase: ScannerLifecyclePhase): void {
    switch (phase) {
      case 'background':
      case 'inactive':
        this.stopScanningIfNeeded();
        break;
      case 'active':
        this.startScanningIfPossible();
        break;
    }
  }

  visionKitScannerDidAdd(
    _items: VisionKitRecognizedBarcode[],
    allItems: VisionKitRecognizedBarcode[],
  ): void {
    this.publish(allItems);
  }

  visionKitScannerDidUpdate(
    _items: VisionKitRecognizedBarcode[],
    allItems: VisionKitRecognizedBarcode[],
  ): void {
    this.publish(allItems);
  }

  visionKitScannerDidRemove(
    _items: VisionKitRecognizedBarcode[],
    allItems: VisionKitRecognizedBarcode[],
  ): void {
    this.publish(allItems);
  }

  private startScanningIfPossible(): void {
    if (
      this.receiveFrame == null ||
      !this.platform.isSupported ||
      !this.platform.isAvailable
    ) {
      return;
    }

    if (this.controller == null) {
      this.controller = this.platform.makeController(
        VisionKitScannerObservationSource.productConfiguration,
        this,
      );
    }

    if (this.controller.isScanning) {
      return;
    }

    this.controller.startScanning();
  }

  private stopScanningIfNeeded(): void {
    if (this.controller?.isScanning !== true) {
      return;
    }
    this.controller.stopScanning();
  }

  private publish(allItems: VisionKitRecognizedBarcode[]): void {
    if (this.receiveFrame == null || this.controller?.isScanning !== true) {
      return;
    }

    const timestamp = this.clock.now;
    const viewSize = this.controller?.viewSize ?? { width: 0, height: 0 };
    this.receiveFrame(
      allItems.flatMap((item) => {
        const mapped = mapObservation({
          payload: item.payload,
          bounds: item.bounds,
          viewSize,
          timestamp,
          engineID: this.engineID,
        });
        return mapped ? [mapped] : [];
      }),
    );
  }
}
