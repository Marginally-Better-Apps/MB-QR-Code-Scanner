import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';

export function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('history')}</Text>
      <Text style={styles.description}>{t('historyPlaceholder')}</Text>
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
});
