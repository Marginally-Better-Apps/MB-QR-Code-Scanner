import * as Clipboard from 'expo-clipboard';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';

type Props = {
  payload: string;
};

export function ObservationResultBar({ payload }: Props) {
  const [didCopy, setDidCopy] = useState(false);
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

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
        <SymbolView
          name={didCopy ? 'checkmark' : 'doc.on.clipboard'}
          size={18}
          tintColor="#fff"
          pointerEvents="none"
        />
      </Pressable>
    </View>
  );

  if (glass) {
    return (
      <GlassView
        testID="scanner-observation-bar"
        style={styles.bar}
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive>
        {body}
      </GlassView>
    );
  }

  return (
    <View testID="scanner-observation-bar" style={[styles.bar, styles.fallback]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(28,28,30,0.88)',
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
    color: '#fff',
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: 'rgba(235,235,245,0.36)',
  },
  copyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
