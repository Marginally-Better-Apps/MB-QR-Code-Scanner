import * as Clipboard from 'expo-clipboard';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';

type Props = {
  payload: string;
};

export function ObservationResultBar({ payload }: Props) {
  const [didCopy, setDidCopy] = useState(false);
  const glass =
    isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

  async function copyPayload() {
    await Clipboard.setStringAsync(payload);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }

  const body = (
    <View style={styles.row}>
      <Text
        testID="scanner-observation-payload"
        numberOfLines={1}
        ellipsizeMode="middle"
        style={styles.payload}>
        {payload}
      </Text>
      <View style={styles.separator} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('copy')}
        testID="scanner-observation-copy"
        onPress={copyPayload}
        style={styles.copyButton}
        hitSlop={8}>
        <Text style={styles.copyLabel}>{didCopy ? '✓' : t('copy')}</Text>
      </Pressable>
    </View>
  );

  if (glass) {
    return (
      <GlassView style={styles.bar} glassEffectStyle="regular">
        {body}
      </GlassView>
    );
  }

  return <View style={[styles.bar, styles.fallback]}>{body}</View>;
}

const styles = StyleSheet.create({
  bar: {
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(245,245,247,0.86)',
  },
  row: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  payload: {
    flex: 1,
    paddingLeft: 14,
    paddingRight: 8,
    fontSize: 15,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: 'rgba(60,60,67,0.36)',
  },
  copyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
