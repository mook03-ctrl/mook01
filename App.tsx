import { SafeAreaProvider } from 'react-native-safe-area-context';

import AIExtractorScreen from './src/screens/AIExtractorScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <AIExtractorScreen />
    </SafeAreaProvider>
  );
}
