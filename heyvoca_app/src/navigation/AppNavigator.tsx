import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '../contexts/NavigationContext';

import HomeScreen from '../screens/HomeScreen';


const AppNavigator = () => {
  const { currentScreen, navigationParams } = useNavigation();


  const renderScreen = () => {
    const route = { params: navigationParams };
    switch (currentScreen) {
      case 'home':
          return <HomeScreen />;
    default:
      return <HomeScreen />;
    }
  };

  return (
    <>
      <View className="flex-1">{renderScreen()}</View>
    </>
  );
};

export default AppNavigator;