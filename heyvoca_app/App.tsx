import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationProvider } from './src/contexts/NavigationContext';
import AppNavigator from './src/navigation/AppNavigator';

import "./global.css";

function Main() {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
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
    </SafeAreaProvider>
  );
}