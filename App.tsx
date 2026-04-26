import 'react-native-url-polyfill/auto';
import './global.css';

import { ClerkProvider, SignedIn, SignedOut } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { publishableKey } from './src/lib/env';

export default function App() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SignedIn>
          <HomeScreen />
        </SignedIn>
        <SignedOut>
          <AuthScreen />
        </SignedOut>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
