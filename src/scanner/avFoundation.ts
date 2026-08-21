import {
  hitTarget,
  mapObservation,
  ScannerRecognitionRegion,
  zoomFactor,
} from './geometry';
import type { Point, Rect, Size } from './types';
import type {
  ScannerClock,
  ScannerEngineID,
  ScannerLifecyclePhase,
  ScannerObservation,
  ScannerObservationSource,
} from './types';
import {
  ASPECT_FILL_GRAVITY,
  QR_METADATA_OBJECT_TYPE,
  SystemScannerClock,
} from './types';

export type AVFoundationRecognizedBarcode = {
  payload: string | null;
  bounds: Rect;
};

export type AVFoundationScannerConfiguration = {
  metadataObjectTypes: string[];
  recognitionRegion: Rect;
  videoGravity: string;
};

export type AVFoundationScannerControlling = {
  isScanning: boolean;
  viewSize: Size;
  hasPreview: boolean;
  zoomFactor: number;
  minZoomFactor: number;
  maxZoomFactor: number;
  startScanning(): void;
  stopScanning(): void;
  setZoomFactor(factor: number): void;
  focus(atNormalizedPoint: Point): void;
  updatePreviewLayout(): void;
};

export type AVFoundationScannerEventSink = {
  avFoundationScannerDidOutput(items: AVFoundationRecognizedBarcode[]): void;
};

export type AVFoundationScannerPlatform = {
  isAuthorized: boolean;
  makeController(
    configuration: AVFoundationScannerConfiguration,
    eventSink: AVFoundationScannerEventSink,
  ): AVFoundationScannerControlling;
};

export const avFoundationProductConfiguration: AVFoundationScannerConfiguration =
  {
    metadataObjectTypes: [QR_METADATA_OBJECT_TYPE],
    recognitionRegion: ScannerRecognitionRegion.fullPreview,
    videoGravity: ASPECT_FILL_GRAVITY,
  };

export class AVFoundationScannerObservationSource
  implements ScannerObservationSource, AVFoundationScannerEventSink
{
  readonly engineID: ScannerEngineID = 'avfoundation';
  readonly usesCustomCameraGestures = true;

  static readonly productMetadataObjectTypes = [QR_METADATA_OBJECT_TYPE];
  static readonly productConfiguration = avFoundationProductConfiguration;

  private readonly platform: AVFoundationScannerPlatform;
  private readonly clock: ScannerClock;
  private controller: AVFoundationScannerControlling | null = null;
  private receiveFrame: ((frame: ScannerObservation[]) => void) | null = null;
  private pinchBaseZoomFactor = 1;

  constructor(
    platform?: AVFoundationScannerPlatform,
    clock: ScannerClock = SystemScannerClock,
  ) {
    this.platform = platform ?? {
      isAuthorized: false,
      makeController() {
        throw new Error('AVFoundation platform is not available');
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

  handlePreviewLayoutChange(): void {
    this.controller?.updatePreviewLayout();
  }

  beginPinchZoom(): void {
    this.pinchBaseZoomFactor = this.controller?.zoomFactor ?? 1;
  }

  updatePinchZoom(
    scale: number,
    atNormalizedPoint: Point,
    resultActionRect: Rect | null | undefined,
    onResultAction: () => void,
  ): void {
    if (hitTarget(atNormalizedPoint, resultActionRect) !== 'camera') {
      return;
    }

    const factor = zoomFactor(
      this.pinchBaseZoomFactor,
      scale,
      this.controller?.minZoomFactor ?? 1,
      this.controller?.maxZoomFactor ?? 1,
    );
    this.controller?.setZoomFactor(factor);
  }

  focus(
    atNormalizedPoint: Point,
    resultActionRect: Rect | null | undefined,
    onResultAction: () => void,
  ): void {
    switch (hitTarget(atNormalizedPoint, resultActionRect)) {
      case 'resultAction':
        onResultAction();
        break;
      case 'camera':
        this.controller?.focus(atNormalizedPoint);
        break;
    }
  }

  avFoundationScannerDidOutput(items: AVFoundationRecognizedBarcode[]): void {
    if (this.receiveFrame == null || this.controller?.isScanning !== true) {
      return;
    }

    const timestamp = this.clock.now;
    const viewSize = this.controller?.viewSize ?? { width: 0, height: 0 };
    this.receiveFrame(
      items.flatMap((item) => {
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

  private startScanningIfPossible(): void {
    if (this.receiveFrame == null || !this.platform.isAuthorized) {
      return;
    }

    if (this.controller == null) {
      this.controller = this.platform.makeController(
        AVFoundationScannerObservationSource.productConfiguration,
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
}
