import { useRouter } from 'expo-router';

import { HistoryScreen } from '@/components/HistoryScreen';

export default function HistoryRoute() {
  const router = useRouter();
  return <HistoryScreen onBack={() => router.back()} />;
}
