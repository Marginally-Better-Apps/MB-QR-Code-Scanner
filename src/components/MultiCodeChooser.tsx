import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { parseQRPayload } from '@/scanner/payloadParser';
import type { ScoredMultiCodeCandidate } from '@/scanner/multiCode';

type Props = {
  candidates: ScoredMultiCodeCandidate[];
  onSelect: (candidateId: string) => void;
};

function spatialOrder(a: ScoredMultiCodeCandidate, b: ScoredMultiCodeCandidate): number {
  if (a.bounds.y !== b.bounds.y) {
    return a.bounds.y - b.bounds.y;
  }
  return a.bounds.x - b.bounds.x;
}

export function MultiCodeChooser({ candidates, onSelect }: Props) {
  const ordered = useMemo(() => [...candidates].sort(spatialOrder), [candidates]);

  return (
    <View
      testID="multi-code-chooser"
      accessibilityLabel={t('selectCode')}
      style={styles.list}>
      {ordered.map((candidate) => {
        const parsed = parseQRPayload(candidate.rawPayload);
        const label = `${parsed.content.kind}, ${parsed.displaySummary}`;
        return (
          <Pressable
            key={candidate.id}
            testID="multi-code-row"
            nativeID={candidate.id}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => onSelect(candidate.id)}
            style={styles.row}>
            <Text numberOfLines={1} style={styles.kind}>
              {parsed.content.kind}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="middle" style={styles.summary}>
              {parsed.displaySummary}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(28,28,30,0.92)',
  },
  row: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
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
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
});
