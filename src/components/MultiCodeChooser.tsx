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

export function MultiCodeChooser({ candidates, onSelect, onDismiss }: Props) {
  const ordered = useMemo(() => [...candidates].sort(spatialOrder), [candidates]);
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
      {ordered.map((candidate, index) => {
        const parsed = parseQRPayload(candidate.rawPayload);
        const label = `${index + 1} of ${ordered.length}, ${parsed.content.kind}, ${parsed.displaySummary}`;
        return (
          <Pressable
            key={candidate.id}
            testID="multi-code-row"
            nativeID={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(candidate.id)}
            style={styles.row}>
            <Text numberOfLines={1} style={styles.kind} maxFontSizeMultiplier={2.2}>
              {parsed.content.kind}
            </Text>
            <Text
              numberOfLines={2}
              ellipsizeMode="middle"
              style={styles.summary}
              maxFontSizeMultiplier={2.2}>
              {parsed.displaySummary}
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
