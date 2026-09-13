import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  chromeContainerStyle,
  resolveChromeSurface,
  useChromePreferences,
} from '@/components/chromeAppearance';
import { t } from '@/i18n';
import { parseQRPayload } from '@/scanner/payloadParser';
import { createBoundedParseCache } from '@/scanner/performance';
import type { ScoredMultiCodeCandidate } from '@/scanner/multiCode';

type Props = {
  candidates: ScoredMultiCodeCandidate[];
  onSelect: (candidateId: string) => void;
  /** Hardware-keyboard Escape / accessibility escape collapses the chooser. */
  onDismiss?: () => void;
};

function spatialOrder(a: ScoredMultiCodeCandidate, b: ScoredMultiCodeCandidate): number {
  if (a.bounds.y !== b.bounds.y) {
    return a.bounds.y - b.bounds.y;
  }
  return a.bounds.x - b.bounds.x;
}

/**
 * Bounded memo for chooser labels (QLT-04). Metadata frames arrive at a high
 * rate with new array identities but identical payloads; the cache keeps
 * repeated renders from redoing payload parsing, and evicts the oldest entry
 * past capacity so long sessions stay memory-flat.
 */
const parsedPayloadCache = createBoundedParseCache(parseQRPayload);

export function MultiCodeChooser({ candidates, onSelect, onDismiss }: Props) {
  const ordered = useMemo(() => [...candidates].sort(spatialOrder), [candidates]);
  // Content key, not array identity: identical payloads across frames reuse
  // the memoized rows instead of parsing again on every render.
  const contentKey = ordered.map((candidate) => `${candidate.id}\n${candidate.rawPayload}`).join('\n---\n');
  const rows = useMemo(
    () =>
      ordered.map((candidate, index, all) => {
        const parsed = parsedPayloadCache.parse(candidate.rawPayload);
        return {
          key: candidate.id,
          label: `${index + 1} of ${all.length}, ${parsed.content.kind}, ${parsed.displaySummary}`,
          kind: parsed.content.kind,
          summary: parsed.displaySummary,
        };
      }),
    // Recompute only when the candidate contents change; the closure always
    // sees the current render's `ordered`, so equal contents reuse rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentKey],
  );
  const prefs = useChromePreferences();
  const surface = resolveChromeSurface({
    ...prefs,
    tone: 'onMedia',
    liquidGlassAvailable: isGlassEffectAPIAvailable() && isLiquidGlassAvailable(),
  });
  const glass = surface.kind === 'liquidGlass';

  const list = (
    <View
      testID="multi-code-chooser"
      accessibilityLabel={t('selectCode')}
      accessibilityRole="list"
      accessibilityActions={
        onDismiss ? [{ name: 'escape', label: t('dismiss') }] : undefined
      }
      onAccessibilityAction={
        onDismiss
          ? (event) => {
              if (event.nativeEvent.actionName === 'escape') {
                onDismiss();
              }
            }
          : undefined
      }
      style={[styles.list, !glass && chromeContainerStyle(surface)]}>
      <View
        testID={`chrome-surface-${surface.kind}`}
        accessible={false}
        importantForAccessibility="no"
        style={styles.chromeProbe}
      />
      {rows.map((row) => {
        return (
          <Pressable
            key={row.key}
            testID="multi-code-row"
            nativeID={row.key}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            onPress={() => onSelect(row.key)}
            style={styles.row}>
            <Text numberOfLines={1} style={styles.kind} maxFontSizeMultiplier={2.2}>
              {row.kind}
            </Text>
            <Text
              numberOfLines={2}
              ellipsizeMode="middle"
              style={styles.summary}
              maxFontSizeMultiplier={2.2}>
              {row.summary}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!glass) {
    return list;
  }

  return (
    <GlassView
      style={styles.list}
      glassEffectStyle="regular"
      colorScheme="dark"
      isInteractive>
      {list}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  chromeProbe: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  row: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  kind: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD60A',
  },
  summary: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '60%',
    fontSize: 15,
    color: '#fff',
  },
});
