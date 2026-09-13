import 'react-native-gesture-handler';
import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider, TabPresentationSync } from '@/state/AppProvider';

/**
 * Root chrome stays on the system Stack from expo-router / react-native-screens.
 * Floating camera overlays own the only custom Liquid Glass surfaces.
 */
export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppProvider>
          <TabPresentationSync />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'default',
            }}
          />
        </AppProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
