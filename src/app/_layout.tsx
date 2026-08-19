import { Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AppProvider, TabPresentationSync } from '@/state/AppProvider';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
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
  );
}
