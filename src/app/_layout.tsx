import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider, TabPresentationSync } from '@/state/AppProvider';

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
