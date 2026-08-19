import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

type Tone = 'onMedia' | 'onCanvas';
type Shape = 'circle' | 'pill';

type Props = {
  accessibilityLabel: string;
  testID: string;
  onPress: () => void;
  children: ReactNode;
  tone?: Tone;
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
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
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
        !glass && (tone === 'onMedia' ? styles.mediaFallback : styles.canvasFallback),
      ]}>
      {children}
    </Pressable>
  );

  if (!glass) {
    return <View style={style}>{pressable}</View>;
  }

  return (
    <GlassView
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
  mediaFallback: {
    backgroundColor: 'rgba(28, 28, 30, 0.55)',
  },
  canvasFallback: {
    backgroundColor: 'rgba(245, 245, 247, 0.86)',
  },
});
