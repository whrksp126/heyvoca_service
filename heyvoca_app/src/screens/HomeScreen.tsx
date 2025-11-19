import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, StatusBar, BackHandler, View } from 'react-native';
import WebView from 'react-native-webview';
import handleWebViewMessage from '../handlers/webviewMessageHandler';
import Config from 'react-native-config';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IapScreen from './IapScreen';

const FRONT_URL = Config.APP_ENV === 'local' && Platform.OS === 'android' ? Config.ANDROID_FRONT_URL : Config.FRONT_URL;


const HomeScreen = () => {
  const webViewRef = useRef<WebView>(null);
  const [isIapTest, setIsIapTest] = useState(false);
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top;

  useEffect(() => {
    const backAction = () => {
      if (webViewRef.current) {
        // 웹의 onBackPressed 함수를 직접 호출
        webViewRef.current.injectJavaScript(`
          (function() {
            if (window.onBackPressed) {
              window.onBackPressed();
            }
          })();
        `);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  const handleExitApp = () => {
    // 웹에서 closeApp 호출 시 앱 종료
    BackHandler.exitApp();
  };

  console.log('FRONT_URL', FRONT_URL);

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}> 
      <StatusBar 
        barStyle={'dark-content'}
        backgroundColor={'transparent'}
        translucent={true}
        hidden={false} 
      />
      {isIapTest ? (
        <IapScreen onClose={() => setIsIapTest(false)} />
      ) : (
        <WebView
          source={{ uri: FRONT_URL || '' }}
          ref={webViewRef}
          bounces={false}
          overScrollMode="never"
          userAgent="HeyVoca"
          onMessage={event => handleWebViewMessage(event, webViewRef, handleExitApp)}
          javaScriptEnabled={true}
          webviewDebuggingEnabled={true}
          injectedJavaScript={`
            (function() {
              // CSS 변수 설정: 상태바 높이
              document.documentElement.style.setProperty('--status-bar-height', '${statusBarHeight}px');
              console.log('statusBarHeight', '${statusBarHeight}px');
              window.alert = function(message) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'alert', message: message }));
              };
              // window.console.log = function(message) {
              //   window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: message }));
              // };
            })();
          `}
          style={styles.webview}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});

export default HomeScreen;