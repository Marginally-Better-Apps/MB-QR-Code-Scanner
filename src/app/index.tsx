import { ScannerScreen } from '@/components/ScannerScreen';
import { useBootstrappedApp } from '@/state/AppProvider';

export default function ScannerRoute() {
  const { appState, engine } = useBootstrappedApp();
  return (
    <ScannerScreen
      session={appState.scannerSession}
      engine={engine === 'fixture' ? 'avfoundation' : engine}
    />
  );
}
