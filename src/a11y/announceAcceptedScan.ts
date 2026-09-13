import { AccessibilityInfo } from 'react-native';

import { describeForAccessibility } from '@/privacy/redaction';
import { parseQRPayload } from '@/scanner/payloadParser';
import { t } from '@/i18n';

export type AccessibilityAnnouncer = (message: string) => void;

function systemAnnounce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility?.(message);
  } catch {
    // Announce is best-effort on older runtimes.
  }
}

/**
 * Announce a single accepted scan to VoiceOver.
 * Call only when the sticky current result changes, never per camera frame.
 * The spoken text flows through `describeForAccessibility` so raw secrets
 * can never be read aloud; the announcer is injectable for tests.
 */
export function announceAcceptedScan(
  rawPayload: string,
  announce: AccessibilityAnnouncer = systemAnnounce,
): void {
  const summary = describeForAccessibility(
    parseQRPayload(rawPayload),
    t('historyRedactedTitle'),
  );
  announce(t('acceptedScanAnnounce', { summary }));
}
