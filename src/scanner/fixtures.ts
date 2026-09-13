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
  private readonly stabilizeStartup: boolean;
  private receiveFrame: ((frame: ScannerObservation[]) => void) | null = null;

  constructor(input: {
    engineID: ScannerEngineID;
    clock?: ScannerClock;
    startupFrame?: ScannerFixtureDetection[];
    /** Emit the startup frame twice so a single-code fixture can pass the acceptance gate. */
    stabilizeStartup?: boolean;
  }) {
    this.engineID = input.engineID;
    this.clock = input.clock ?? SystemScannerClock;
    this.startupFrame = input.startupFrame;
    this.stabilizeStartup = input.stabilizeStartup === true;
  }

  start(receiveFrame: (frame: ScannerObservation[]) => void): void {
    this.receiveFrame = receiveFrame;
    if (this.startupFrame) {
      this.emit(this.startupFrame);
      if (this.stabilizeStartup) {
        this.emit(this.startupFrame);
      }
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

const COMMS_BOUNDS: Rect = { x: 0.2, y: 0.3, width: 0.6, height: 0.25 };

export const EMAIL_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'mailto:alice@example.com?subject=Hello&body=See%20you%20at%208',
    displayBounds: COMMS_BOUNDS,
  },
];

export const PHONE_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'tel:+1 (415) 555-2671',
    displayBounds: COMMS_BOUNDS,
  },
];

export const SMS_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'sms:+14155552671?body=Running%20late',
    displayBounds: COMMS_BOUNDS,
  },
];

export const GEO_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'geo:37.7749,-122.4194?q=Ferry+Building',
    displayBounds: COMMS_BOUNDS,
  },
];

export const CONTACT_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload:
      'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nORG:Acme Labs\nTEL:+14155552671\nEMAIL:jane@example.com\nEND:VCARD',
    displayBounds: COMMS_BOUNDS,
  },
];

export const CALENDAR_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload:
      'BEGIN:VEVENT\nSUMMARY:Team Meeting\nDTSTART:20260912T140000Z\nDTEND:20260912T150000Z\nLOCATION:Room 1\nEND:VEVENT',
    displayBounds: COMMS_BOUNDS,
  },
];

export const WIFI_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'WIFI:T:WPA;S:HomeNet;P:supersecret;;',
    displayBounds: COMMS_BOUNDS,
  },
];

export const OTP_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload:
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
    displayBounds: COMMS_BOUNDS,
  },
];

export const OTP_MIGRATION_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'otpauth-migration://offline?data=ZGlzcG9zYWJsZS1maXh0dXJl',
    displayBounds: COMMS_BOUNDS,
  },
];

export const PASSKEY_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'FIDO:/000111222333444555666777888999',
    displayBounds: COMMS_BOUNDS,
  },
];

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

/** Two simultaneous codes: symmetric sizes so neither dominates (ambiguous). */
export const TWO_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'https://example.com/two-left',
    displayBounds: { x: 0.05, y: 0.4, width: 0.15, height: 0.15 },
  },
  {
    rawPayload: 'Hello from the right code',
    displayBounds: { x: 0.8, y: 0.4, width: 0.15, height: 0.15 },
  },
];

/** Three simultaneous codes in top→bottom spatial order with varied kinds. */
export const THREE_CODE_FIXTURE: ScannerFixtureDetection[] = [
  {
    rawPayload: 'https://example.com/three-top',
    displayBounds: { x: 0.3, y: 0.08, width: 0.16, height: 0.16 },
  },
  {
    rawPayload: 'Hello middle code',
    displayBounds: { x: 0.3, y: 0.42, width: 0.16, height: 0.16 },
  },
  {
    rawPayload: 'myapp://pay?amount=10',
    displayBounds: { x: 0.3, y: 0.74, width: 0.16, height: 0.16 },
  },
];
