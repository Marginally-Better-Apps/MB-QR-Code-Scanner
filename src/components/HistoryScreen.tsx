import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  I18nManager,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { GlassControl } from '@/components/GlassControl';
import { HistorySwipeableRow } from '@/components/HistorySwipeableRow';
import { StickyResultBar } from '@/components/StickyResultBar';
import { groupHistoryEvents } from '@/history/historyGrouping';
import { presentHistoryRow } from '@/history/historyRowPresentation';
import type { StoredHistoryEvent } from '@/history/historyPolicy';
import { presentHistoryDetailTime, replayHistoryEvent } from '@/history/historyReplay';
import { layoutDirection, type LayoutDirection } from '@/history/historySwipe';
import { getLocale, t } from '@/i18n';
import type { ResultActionDeps } from '@/scanner/actionRouter';
import { useHistoryActions, useHistoryEvents } from '@/state/historyEvents';

type Props = {
  onBack?: () => void;
  events?: StoredHistoryEvent[];
  now?: Date;
  timeZone?: string;
  locale?: string;
  actionDeps?: ResultActionDeps;
  onDelete?: (id: string) => void | Promise<void>;
  onUndo?: (event: StoredHistoryEvent) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  direction?: LayoutDirection;
  scheduleUndoExpiry?: (dismiss: () => void) => void;
  undoWindowMs?: number;
};

export function HistoryScreen({
  onBack,
  events: eventsProp,
  now,
  timeZone,
  locale,
  actionDeps,
  onDelete,
  onUndo,
  onClear,
  direction,
  scheduleUndoExpiry,
  undoWindowMs = 5000,
}: Props) {
  const contextEvents = useHistoryEvents();
  const contextActions = useHistoryActions();
  const events = eventsProp ?? contextEvents;
  const deleteEvent = onDelete ?? contextActions?.deleteEvent;
  const restoreEvent = onUndo ?? contextActions?.restoreEvent;
  const clearEvents = onClear ?? contextActions?.clearEvents;
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const resolvedLocale = locale ?? (getLocale() === 'es' ? 'es' : 'en-US');
  const resolvedTimeZone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const resolvedNow = now ?? new Date();
  const resolvedDirection = direction ?? layoutDirection(I18nManager.isRTL);
  const [selected, setSelected] = useState<StoredHistoryEvent | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [restoredEvents, setRestoredEvents] = useState<StoredHistoryEvent[]>([]);
  const [pendingUndo, setPendingUndo] = useState<StoredHistoryEvent | null>(null);
  const undoGeneration = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current != null) {
        clearTimeout(undoTimer.current);
      }
    };
  }, []);

  const mergedEvents = [
    ...events,
    ...restoredEvents.filter((event) => !events.some((item) => item.id === event.id)),
  ].sort((left, right) => Date.parse(right.acceptedAt) - Date.parse(left.acceptedAt));
  const visibleEvents = mergedEvents.filter((event) => !hiddenIds.includes(event.id));

  const sections = groupHistoryEvents(visibleEvents, {
    now: resolvedNow,
    timeZone: resolvedTimeZone,
    locale: resolvedLocale,
    todayLabel: t('historyToday'),
    yesterdayLabel: t('historyYesterday'),
  });

  const textColor = dark ? styles.lightText : null;
  const empty = visibleEvents.length === 0;
  const visibleCount = visibleEvents.length;

  function armUndo(event: StoredHistoryEvent) {
    setPendingUndo(event);
    const generation = undoGeneration.current + 1;
    undoGeneration.current = generation;
    const expire = () => {
      if (undoGeneration.current === generation) {
        setPendingUndo(null);
      }
    };
    if (undoTimer.current != null) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    if (scheduleUndoExpiry) {
      scheduleUndoExpiry(expire);
      return;
    }
    undoTimer.current = setTimeout(expire, undoWindowMs);
  }

  function handleDelete(event: StoredHistoryEvent) {
    setHiddenIds((ids) => (ids.includes(event.id) ? ids : [...ids, event.id]));
    setRestoredEvents((current) => current.filter((item) => item.id !== event.id));
    if (selected?.id === event.id) {
      setSelected(null);
    }
    armUndo(event);
    void Promise.resolve(deleteEvent?.(event.id));
  }

  function handleUndo() {
    if (pendingUndo == null) {
      return;
    }
    const event = pendingUndo;
    undoGeneration.current += 1;
    setHiddenIds((ids) => ids.filter((id) => id !== event.id));
    setRestoredEvents((current) =>
      current.some((item) => item.id === event.id) ? current : [...current, event],
    );
    setPendingUndo(null);
    void Promise.resolve(restoreEvent?.(event));
  }

  function handleClearRequest() {
    Alert.alert(
      t('historyClearConfirmTitle'),
      visibleCount === 1
        ? t('historyClearConfirmMessageOne')
        : t('historyClearConfirmMessage', { count: visibleCount }),
      [
        { text: t('historyClearCancel'), style: 'cancel' },
        {
          text: t('historyClearConfirm'),
          style: 'destructive',
          onPress: () => {
            setHiddenIds(visibleEvents.map((event) => event.id));
            setPendingUndo(null);
            setSelected(null);
            void Promise.resolve(clearEvents?.());
          },
        },
      ],
    );
  }

  function handleBack() {
    if (selected) {
      setSelected(null);
      return;
    }
    onBack?.();
  }

  const replay = selected ? replayHistoryEvent(selected) : null;
  const selectedTime = selected
    ? presentHistoryDetailTime(selected.acceptedAt, {
        now: resolvedNow,
        locale: resolvedLocale,
        timeZone: resolvedTimeZone,
      })
    : null;
  const selectedRow = selected
    ? presentHistoryRow(selected, {
        locale: resolvedLocale,
        timeZone: resolvedTimeZone,
        redactedTitle: t('historyRedactedTitle'),
        wifiTitle: t('historyWifiTitle'),
      })
    : null;

  const clearLabel =
    visibleCount === 1 ? t('historyClearCountOne') : t('historyClearCount', { count: visibleCount });

  return (
    <View style={[styles.container, dark && styles.darkContainer]}>
      <GlassControl
        accessibilityLabel={t('back')}
        testID="history-back"
        onPress={handleBack}
        tone={dark ? 'onMedia' : 'onCanvas'}
        style={[styles.backButton, { top: insets.top + 8 }]}>
        <SymbolView
          name="chevron.backward"
          size={20}
          tintColor={dark ? '#fff' : '#000'}
          pointerEvents="none"
        />
      </GlassControl>

      {selected && replay && selectedTime && selectedRow ? (
        <View
          testID="history-detail"
          style={[
            styles.detail,
            { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 },
          ]}>
          <Text style={[styles.title, textColor]}>
            {replay.status === 'replayable'
              ? replay.parsed.displaySummary
              : selectedRow.title}
          </Text>
          <Text testID="history-detail-relative" style={[styles.relative, textColor]}>
            {selectedTime.relative}
          </Text>
          <Text testID="history-detail-exact" style={[styles.exact, textColor]}>
            {selectedTime.exact}
          </Text>
          {replay.status === 'replayable' ? (
            <StickyResultBar
              payload={replay.parsed.originalPayload}
              onClear={() => setSelected(null)}
              actionDeps={actionDeps}
            />
          ) : (
            <Text testID="history-detail-not-saved" style={[styles.notSaved, textColor]}>
              {replay.reason === 'wifi'
                ? t('historyWifiNotSaved')
                : t('historySensitiveNotSaved')}
            </Text>
          )}
        </View>
      ) : empty ? (
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
          renderScrollComponent={(props) => <GestureScrollView {...props} />}
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
            <View style={styles.listHeader}>
              <Text style={[styles.title, styles.listTitle, textColor]}>{t('history')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={clearLabel}
                testID="history-clear"
                onPress={handleClearRequest}
                style={styles.clearButton}>
                <Text style={[styles.clearLabel, textColor]}>{clearLabel}</Text>
              </Pressable>
            </View>
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
              <HistorySwipeableRow
                direction={resolvedDirection}
                onDelete={() => handleDelete(item)}>
                <Pressable
                  testID="history-row"
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}, ${row.timeLabel}`}
                  onPress={() => setSelected(item)}
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
                </Pressable>
              </HistorySwipeableRow>
            );
          }}
        />
      )}
      {pendingUndo ? (
        <View
          testID="history-undo-banner"
          style={[styles.undoBanner, { bottom: insets.bottom + 16 }, dark && styles.undoBannerDark]}>
          <Text style={[styles.undoMessage, dark && styles.lightText]}>
            {t('historyScanDeleted')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('historyUndo')}
            testID="history-undo"
            onPress={handleUndo}
            hitSlop={8}
            style={styles.undoButton}>
            <Text style={styles.undoAction} maxFontSizeMultiplier={2.2}>
              {t('historyUndo')}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
    paddingBottom: 12,
  },
  listTitle: {
    paddingHorizontal: 20,
  },
  clearButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  clearLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff3b30',
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
    backgroundColor: '#f2f2f7',
  },
  ctaDark: {
    backgroundColor: '#1c1c1e',
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
  detail: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 8,
  },
  relative: {
    fontSize: 16,
    fontWeight: '500',
  },
  exact: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 16,
  },
  notSaved: {
    fontSize: 16,
    lineHeight: 22,
    opacity: 0.8,
  },
  undoBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 4,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1e',
  },
  undoBannerDark: {
    backgroundColor: '#2c2c2e',
  },
  undoMessage: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  undoAction: {
    color: '#0a84ff',
    fontSize: 16,
    fontWeight: '700',
  },
  undoButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
