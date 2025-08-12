import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NavigationContextType {
  currentScreen: string;
  navigationParams: any;
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
  replace: (screen: string) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [navigationParams, setNavigationParams] = useState<any>({});
  const [navigationHistory, setNavigationHistory] = useState<string[]>(['home']);

  const navigate = (screen: string, params?: any) => {
    setNavigationHistory(prev => [...prev, screen]);
    setCurrentScreen(screen);
    setNavigationParams(params || {});
  };

  const goBack = () => {
    if (navigationHistory.length > 1) {
      const newHistory = navigationHistory.slice(0, -1);
      const previousScreen = newHistory[newHistory.length - 1];
      setNavigationHistory(newHistory);
      setCurrentScreen(previousScreen);
      setNavigationParams({});
    }
  };

  const replace = (screen: string) => {
    setCurrentScreen(screen);
    setNavigationParams({});
  };

  const value: NavigationContextType = {
    currentScreen,
    navigationParams,
    navigate,
    goBack,
    replace,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}; 