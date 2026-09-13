import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, type ViewStyle } from 'react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

export type ChromeTone = 'onMedia' | 'onCanvas';

export type ChromePreferences = {
  reduceTransparency: boolean;
  increaseContrast: boolean;
};

export type ChromeSurfaceKind = 'liquidGlass' | 'semanticOpaque';

export type ChromeSurface = {
  kind: ChromeSurfaceKind;
  /** Solid fill used when Liquid Glass is off or Reduced Transparency is on. */
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
  /** Foreground intended for icons/labels on this surface. */
  contentColor: string;
  /** Secondary labels (paths, notes) on this surface. */
  secondaryContentColor: string;
};

export type ResolveChromeSurfaceInput = ChromePreferences & {
  tone: ChromeTone;
  liquidGlassAvailable?: boolean;
};

function liquidGlassRuntimeAvailable(): boolean {
  return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

/**
 * Resolve the public chrome treatment for floating camera overlays.
 *
 * Liquid Glass is only used when the runtime exposes it and the user has not
 * asked for Reduced Transparency. Fallbacks are opaque semantic fills, not a
 * translucent imitation of the latest effect.
 */
export function resolveChromeSurface(input: ResolveChromeSurfaceInput): ChromeSurface {
  const liquidGlassAvailable =
    input.liquidGlassAvailable ?? liquidGlassRuntimeAvailable();
  const useLiquidGlass = liquidGlassAvailable && !input.reduceTransparency;

  if (useLiquidGlass) {
    return {
      kind: 'liquidGlass',
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      contentColor: '#ffffff',
      secondaryContentColor: 'rgba(255,255,255,0.75)',
    };
  }

  if (input.tone === 'onMedia') {
    if (input.increaseContrast) {
      return {
        kind: 'semanticOpaque',
        backgroundColor: '#000000',
        borderWidth: 2,
        borderColor: '#ffffff',
        contentColor: '#ffffff',
        secondaryContentColor: '#ffffff',
      };
    }
    return {
      kind: 'semanticOpaque',
      backgroundColor: '#1c1c1e',
      borderWidth: 0,
      borderColor: 'transparent',
      contentColor: '#ffffff',
      secondaryContentColor: '#ebebf5',
    };
  }

  if (input.increaseContrast) {
    return {
      kind: 'semanticOpaque',
      backgroundColor: '#ffffff',
      borderWidth: 2,
      borderColor: '#000000',
      contentColor: '#000000',
      secondaryContentColor: '#000000',
    };
  }

  return {
    kind: 'semanticOpaque',
    backgroundColor: '#f2f2f7',
    borderWidth: 0,
    borderColor: 'transparent',
    contentColor: '#000000',
    secondaryContentColor: '#3a3a3c',
  };
}

export function chromeContainerStyle(surface: ChromeSurface): ViewStyle {
  return {
    backgroundColor: surface.backgroundColor,
    borderWidth: surface.borderWidth,
    borderColor: surface.borderColor,
  };
}

export function useChromePreferences(): ChromePreferences {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [increaseContrast, setIncreaseContrast] = useState(false);

  useEffect(() => {
    let mounted = true;

    const readReduce = () => {
      try {
        const query = AccessibilityInfo.isReduceTransparencyEnabled?.();
        if (query && typeof (query as Promise<boolean>).then === 'function') {
          void (query as Promise<boolean>)
            .then((enabled) => {
              if (mounted) {
                setReduceTransparency(enabled === true);
              }
            })
            .catch(() => {});
        }
      } catch {
        // Keep the default.
      }
    };

    const readContrast = () => {
      try {
        const query = AccessibilityInfo.isDarkerSystemColorsEnabled?.();
        if (query && typeof (query as Promise<boolean>).then === 'function') {
          void (query as Promise<boolean>)
            .then((enabled) => {
              if (mounted) {
                setIncreaseContrast(enabled === true);
              }
            })
            .catch(() => {});
        }
      } catch {
        // Keep the default.
      }
    };

    readReduce();
    readContrast();

    const subscriptions: Array<{ remove?: () => void } | undefined> = [];
    try {
      subscriptions.push(
        AccessibilityInfo.addEventListener?.(
          'reduceTransparencyChanged',
          setReduceTransparency,
        ),
      );
    } catch {
      // Ignore missing listeners in tests/older runtimes.
    }
    try {
      subscriptions.push(
        AccessibilityInfo.addEventListener?.(
          'darkerSystemColorsChanged',
          setIncreaseContrast,
        ),
      );
    } catch {
      // Ignore missing listeners in tests/older runtimes.
    }

    return () => {
      mounted = false;
      for (const subscription of subscriptions) {
        try {
          subscription?.remove?.();
        } catch {
          // Ignore cleanup errors in tests.
        }
      }
    };
  }, []);

  return { reduceTransparency, increaseContrast };
}

/** True when this process should render expo-glass-effect GlassView. */
export function shouldUseLiquidGlass(prefs: ChromePreferences): boolean {
  return resolveChromeSurface({
    ...prefs,
    tone: 'onMedia',
  }).kind === 'liquidGlass';
}

export function systemStackUsesNativeChrome(): boolean {
  return Platform.OS === 'ios';
}
