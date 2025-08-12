import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, BackHandler, ToastAndroid } from 'react-native';
import { WebView } from 'react-native-webview';
import handleWebViewMessage from '../handlers/webviewMessageHandler';
import Config from 'react-native-config';


import { Platform } from 'react-native';

const FRONT_URL = Platform.OS === 'android' ? Config.ANDROID_FRONT_URL : Config.FRONT_URL;


const HomeScreen = () => {
  const webViewRef = useRef(null);
  const [lastBackPressed, setLastBackPressed] = useState(0);

  useEffect(() => {
    const backAction = () => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          (function() {
            const isBackable = is_backable();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'isBackable', value: isBackable }));
          })();
        `);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [lastBackPressed]);

  const handleExitApp = () => {
    const now = Date.now();
    if (lastBackPressed && (now - lastBackPressed) < 2000) {
      BackHandler.exitApp();
    } else {
      ToastAndroid.show('종료하려면 뒤로를 다시 누르세요..', ToastAndroid.SHORT);
      setLastBackPressed(now);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#fff' }]}> 
      <StatusBar 
        barStyle={'dark-content'}
        backgroundColor={'#fff'}
        translucent={false}
        hidden={false} 
      />
      <WebView
        source={{ uri: FRONT_URL }}
        ref={webViewRef}
        bounces={false}
        overScrollMode="never"
        userAgent="HeyVoca"
        onMessage={event => handleWebViewMessage(event, webViewRef, handleExitApp)}
        javaScriptEnabled={true}
        injectedJavaScript={`
          window.alert = function(message) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'alert', message: message }));
          };
          window.console.log = function(message) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: message }));
          };
        `}
        style={styles.webview}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});

export default HomeScreen;