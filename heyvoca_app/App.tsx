import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { NavigationProvider } from './src/contexts/NavigationContext';
import AppNavigator from './src/navigation/AppNavigator';

import "./global.css";

function Main() {
  return (
    <SafeAreaView className="flex-1 bg-black" edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <AppNavigator />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationProvider>
        <Main />
      </NavigationProvider>
      <Toast />
    </SafeAreaProvider>
  );
}