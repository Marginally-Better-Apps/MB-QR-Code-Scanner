import { AccessibilityInfo } from 'react-native';

import { parseQRPayload } from '@/scanner/payloadParser';
import { t } from '@/i18n';

/**
 * Announce a single accepted scan to VoiceOver.
 * Call only when the sticky current result changes, never per camera frame.
 */
export function announceAcceptedScan(rawPayload: string): void {
  const summary = parseQRPayload(rawPayload).displaySummary;
  const message = t('acceptedScanAnnounce', { summary });
  try {
    AccessibilityInfo.announceForAccessibility?.(message);
  } catch {
    // Announce is best-effort on older runtimes.
  }
}
