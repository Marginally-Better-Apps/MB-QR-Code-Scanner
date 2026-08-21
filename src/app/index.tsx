import { useRouter } from 'expo-router';

import { ScannerScreen } from '@/components/ScannerScreen';
import { useBootstrappedApp } from '@/state/AppProvider';

export default function ScannerRoute() {
  const router = useRouter();
  const { appState, engine, nativeImageFixture } = useBootstrappedApp();
  return (
    <ScannerScreen
      session={appState.scannerSession}
      engine={engine === 'fixture' ? 'avfoundation' : engine}
      nativeImageFixture={nativeImageFixture}
      onOpenHistory={() => router.push('/history')}
    />
  );
}
