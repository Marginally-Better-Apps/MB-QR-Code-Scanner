import { Pressable, SectionList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { GlassControl } from '@/components/GlassControl';
import { groupHistoryEvents } from '@/history/historyGrouping';
import { presentHistoryRow } from '@/history/historyRowPresentation';
import type { StoredHistoryEvent } from '@/history/historyPolicy';
import { getLocale, t } from '@/i18n';
import { useHistoryEvents } from '@/state/historyEvents';

type Props = {
  onBack?: () => void;
  events?: StoredHistoryEvent[];
  now?: Date;
  timeZone?: string;
  locale?: string;
};

export function HistoryScreen({
  onBack,
  events: eventsProp,
  now,
  timeZone,
  locale,
}: Props) {
  const contextEvents = useHistoryEvents();
  const events = eventsProp ?? contextEvents;
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const resolvedLocale = locale ?? (getLocale() === 'es' ? 'es' : 'en-US');
  const resolvedTimeZone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const resolvedNow = now ?? new Date();

  const sections = groupHistoryEvents(events, {
    now: resolvedNow,
    timeZone: resolvedTimeZone,
    locale: resolvedLocale,
    todayLabel: t('historyToday'),
    yesterdayLabel: t('historyYesterday'),
  });

  const textColor = dark ? styles.lightText : null;
  const empty = events.length === 0;

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

      {empty ? (
        <View testID="history-empty" style={styles.empty}>
          <Text style={[styles.title, textColor]}>{t('history')}</Text>
          <Text style={[styles.description, textColor]}>{t('historyPlaceholder')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('historyScanCta')}
            testID="history-scan-cta"
            onPress={() => onBack?.()}
            style={[styles.cta, dark && styles.ctaDark]}>
            <Text style={[styles.ctaLabel, dark && styles.ctaLabelDark]}>
              {t('historyScanCta')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          testID="history-list"
          initialNumToRender={20}
          stickySectionHeadersEnabled={false}
          sections={sections.map((section) => ({
            title: section.title,
            key: section.key,
            data: section.events,
          }))}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 },
          ]}
          ListHeaderComponent={
            <Text style={[styles.title, styles.listTitle, textColor]}>{t('history')}</Text>
          }
          renderSectionHeader={({ section }) => (
            <Text
              testID="history-section-header"
              style={[styles.sectionHeader, dark && styles.sectionHeaderDark]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const row = presentHistoryRow(item, {
              locale: resolvedLocale,
              timeZone: resolvedTimeZone,
              redactedTitle: t('historyRedactedTitle'),
              wifiTitle: t('historyWifiTitle'),
            });
            return (
              <View
                testID="history-row"
                accessibilityLabel={`${row.title}, ${row.timeLabel}`}
                style={[styles.row, dark && styles.rowDark]}>
                <View style={[styles.iconWell, dark && styles.iconWellDark]}>
                  <SymbolView
                    name={row.symbol as 'qrcode'}
                    size={18}
                    tintColor={dark ? '#fff' : '#000'}
                    pointerEvents="none"
                  />
                </View>
                <Text style={[styles.rowTitle, textColor]} numberOfLines={1}>
                  {row.title}
                </Text>
                <Text style={[styles.rowTime, textColor]}>{row.timeLabel}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  darkContainer: {
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 3,
  },
  empty: {
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
  listTitle: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  cta: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 245, 247, 0.96)',
  },
  ctaDark: {
    backgroundColor: 'rgba(28, 28, 30, 0.86)',
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  ctaLabelDark: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6c6c70',
    paddingHorizontal: 4,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: '#f2f2f7',
  },
  sectionHeaderDark: {
    color: '#8e8e93',
    backgroundColor: '#000',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
  },
  rowDark: {
    backgroundColor: '#1c1c1e',
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  iconWellDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  rowTime: {
    fontSize: 13,
    opacity: 0.55,
  },
  lightText: {
    color: '#fff',
  },
});
