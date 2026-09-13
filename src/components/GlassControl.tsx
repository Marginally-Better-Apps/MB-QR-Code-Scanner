import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import {
  chromeContainerStyle,
  resolveChromeSurface,
  useChromePreferences,
  type ChromeTone,
} from '@/components/chromeAppearance';

type Shape = 'circle' | 'pill';

type Props = {
  accessibilityLabel: string;
  testID: string;
  onPress: () => void;
  children: ReactNode;
  tone?: ChromeTone;
  shape?: Shape;
  style?: StyleProp<ViewStyle>;
};

export function GlassControl({
  accessibilityLabel,
  testID,
  onPress,
  children,
  tone = 'onCanvas',
  shape = 'circle',
  style,
}: Props) {
  const prefs = useChromePreferences();
  const surface = resolveChromeSurface({
    ...prefs,
    tone,
    liquidGlassAvailable: isGlassEffectAPIAvailable() && isLiquidGlassAvailable(),
  });
  const glass = surface.kind === 'liquidGlass';
  const shapeStyle = shape === 'circle' ? styles.circle : styles.pill;
  const pressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.hit,
        glass ? StyleSheet.absoluteFill : shapeStyle,
        !glass && chromeContainerStyle(surface),
      ]}>
      {children}
    </Pressable>
  );

  if (!glass) {
    return (
      <View
        testID={`${testID}-chrome`}
        accessibilityLabel={surface.kind}
        style={style}>
        {pressable}
      </View>
    );
  }

  return (
    <GlassView
      testID={`${testID}-chrome`}
      accessibilityLabel={surface.kind}
      style={[shapeStyle, style]}
      glassEffectStyle="regular"
      isInteractive
      colorScheme={tone === 'onMedia' ? 'dark' : 'auto'}>
      {pressable}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  pill: {
    minHeight: 44,
    borderRadius: 22,
    overflow: 'hidden',
    paddingHorizontal: 18,
  },
});
