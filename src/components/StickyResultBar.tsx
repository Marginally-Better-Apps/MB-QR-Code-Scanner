import * as Clipboard from 'expo-clipboard';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';

type Props = {
  payload: string;
  onClear: () => void;
};

export function StickyResultBar({ payload, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

  async function copyPayload() {
    await Clipboard.setStringAsync(payload);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }

  const body = (
    <View>
      <View style={styles.row}>
        <Text
          testID="sticky-result-payload"
          numberOfLines={expanded ? undefined : 1}
          ellipsizeMode="middle"
          style={styles.payload}>
          {payload}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('copy')}
          testID="sticky-result-copy"
          onPress={copyPayload}
          style={styles.iconButton}
          hitSlop={8}>
          <SymbolView
            name={didCopy ? 'checkmark' : 'doc.on.clipboard'}
            size={18}
            tintColor="#fff"
            pointerEvents="none"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('hideDetails') : t('showDetails')}
          testID="sticky-result-expand"
          onPress={() => setExpanded((value) => !value)}
          style={styles.iconButton}
          hitSlop={8}>
          <SymbolView
            name={expanded ? 'chevron.down' : 'chevron.up'}
            size={18}
            tintColor="#fff"
            pointerEvents="none"
          />
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clear')}
          testID="sticky-result-clear"
          onPress={onClear}
          style={styles.iconButton}
          hitSlop={8}>
          <SymbolView
            name="xmark"
            size={18}
            tintColor="#fff"
            pointerEvents="none"
          />
        </Pressable>
      </View>
      {expanded ? (
        <View testID="sticky-result-detail" style={styles.detail}>
          <Text
            testID="sticky-result-full-payload"
            selectable
            style={styles.detailText}>
            {payload}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (glass) {
    return (
      <GlassView
        testID="sticky-result-accessory"
        accessibilityLabel={t('scanResult')}
        style={styles.bar}
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive>
        {body}
      </GlassView>
    );
  }

  return (
    <View
      testID="sticky-result-accessory"
      accessibilityLabel={t('scanResult')}
      style={[styles.bar, styles.fallback]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(28,28,30,0.88)',
  },
  row: {
    minHeight: 44,
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
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 14,
    paddingRight: 4,
    paddingBottom: 8,
    gap: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    paddingTop: 2,
  },
});
