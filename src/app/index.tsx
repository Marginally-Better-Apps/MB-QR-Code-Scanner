import { useRouter } from 'expo-router';

import { ScannerScreen } from '@/components/ScannerScreen';
import { useBootstrappedApp } from '@/state/AppProvider';

export default function ScannerRoute() {
  const router = useRouter();
  const { appState, engine } = useBootstrappedApp();
  return (
    <ScannerScreen
      session={appState.scannerSession}
      engine={engine === 'fixture' ? 'avfoundation' : engine}
      onOpenHistory={() => router.push('/history')}
    />
  );
}
