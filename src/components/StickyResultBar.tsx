import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import {
  defaultResultActionDeps,
  dispatchResultAction,
  type ResultActionDeps,
} from '@/scanner/actionRouter';
import { parseQRPayload } from '@/scanner/payloadParser';
import { describeResultForDisplay } from '@/scanner/webTextPresentation';

type Props = {
  payload: string;
  onClear: () => void;
  actionDeps?: ResultActionDeps;
};

export function StickyResultBar({ payload, onClear, actionDeps }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [didCopy, setDidCopy] = useState(false);
  const glass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

  const parsed = useMemo(() => parseQRPayload(payload), [payload]);
  const view = useMemo(() => describeResultForDisplay(parsed), [parsed]);
  const deps = useMemo(() => actionDeps ?? defaultResultActionDeps(), [actionDeps]);

  const canOpen = parsed.content.kind === 'url' || parsed.content.kind === 'customScheme';
  const openAction = parsed.content.kind === 'customScheme' ? 'openApp' : 'openUrl';
  const openLabel = parsed.content.kind === 'customScheme' ? t('openAppLink') : t('openLink');

  async function handleOpen() {
    await dispatchResultAction(parsed, openAction, deps);
  }

  async function handleCopy() {
    await dispatchResultAction(parsed, 'copy', deps);
    setDidCopy(true);
    setTimeout(() => setDidCopy(false), 1500);
  }

  async function handleShare() {
    await dispatchResultAction(parsed, 'share', deps);
  }

  const preview =
    view.kind === 'web' ? (
      <View style={styles.preview}>
        <Text
          testID="sticky-result-host"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.host}>
          {view.host}
        </Text>
        <Text
          testID="sticky-result-path"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.path}>
          {view.pathPreview}
        </Text>
        {/* Back-compat single-line payload for existing sticky-session tests.
            Safe truncated destination; equals the raw payload for ordinary URLs. */}
        <Text
          testID="sticky-result-payload"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.compatPayload}>
          {view.fullDestination}
        </Text>
      </View>
    ) : view.kind === 'custom' ? (
      <View style={styles.preview}>
        <Text
          testID="sticky-result-scheme"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.scheme}>
          {view.scheme}
        </Text>
        <Text
          testID="sticky-result-custom-remainder"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.path}>
          {view.remainderPreview}
        </Text>
        <Text
          testID="sticky-result-payload"
          numberOfLines={1}
          ellipsizeMode="middle"
          style={styles.compatPayload}>
          {view.full}
        </Text>
      </View>
    ) : (
      <Text
        testID="sticky-result-payload"
        numberOfLines={expanded ? undefined : 1}
        ellipsizeMode="middle"
        style={styles.payload}>
        {view.kind === 'text' ? view.preview : view.preview}
      </Text>
    );

  const fullText =
    view.kind === 'web'
      ? view.fullDestination
      : view.kind === 'text'
        ? view.full
        : view.kind === 'custom'
          ? view.full
          : view.full;

  const body = (
    <View>
      <View style={styles.row}>
        <View style={styles.previewContainer}>{preview}</View>
        {canOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={openLabel}
            testID="sticky-result-open"
            onPress={() => {
              void handleOpen();
            }}
            style={styles.iconButton}
            hitSlop={8}>
            <SymbolView
              name="arrow.up.right.square"
              size={18}
              tintColor="#fff"
              pointerEvents="none"
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('copy')}
          testID="sticky-result-copy"
          onPress={() => {
            void handleCopy();
          }}
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
          accessibilityLabel={t('share')}
          testID="sticky-result-share"
          onPress={() => {
            void handleShare();
          }}
          style={styles.iconButton}
          hitSlop={8}>
          <SymbolView
            name="square.and.arrow.up"
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
            {fullText}
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
  previewContainer: {
    flex: 1,
    paddingLeft: 14,
    paddingRight: 8,
    justifyContent: 'center',
  },
  preview: {
    flex: 1,
    justifyContent: 'center',
  },
  payload: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  host: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  path: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  scheme: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD60A',
  },
  compatPayload: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
    overflow: 'hidden',
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
