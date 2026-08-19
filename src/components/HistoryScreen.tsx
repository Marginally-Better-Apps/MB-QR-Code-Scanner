import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { GlassControl } from '@/components/GlassControl';
import { t } from '@/i18n';

type Props = {
  onBack?: () => void;
};

export function HistoryScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';

  return (
    <View style={[styles.container, dark && styles.darkContainer]}>
      <GlassControl
        accessibilityLabel={t('back')}
        testID="history-back"
        onPress={() => onBack?.()}
        tone={dark ? 'onMedia' : 'onCanvas'}
        style={[styles.backButton, { top: insets.top + 8 }]}>
        <SymbolView
          name="chevron.backward"
          size={20}
          tintColor={dark ? '#fff' : '#000'}
          pointerEvents="none"
        />
      </GlassControl>
      <Text style={[styles.title, dark && styles.lightText]}>{t('history')}</Text>
      <Text style={[styles.description, dark && styles.lightText]}>
        {t('historyPlaceholder')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
    backgroundColor: '#fff',
  },
  darkContainer: {
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  lightText: {
    color: '#fff',
  },
});
