import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, StatusBar, BackHandler, ToastAndroid, View, Text, Button } from 'react-native';
import { WebView } from 'react-native-webview';
import handleWebViewMessage from '../handlers/webviewMessageHandler';
import Config from 'react-native-config';
import { Platform } from 'react-native';
import IapScreen from './IapScreen';
import OCRScreen from './OCRScreen';
import { useNavigation } from '../contexts/NavigationContext';

const FRONT_URL = Config.APP_ENV === 'local' && Platform.OS === 'android' ? Config.ANDROID_FRONT_URL : Config.FRONT_URL;



const HomeScreen = () => {
  const webViewRef = useRef<any>(null);
  const [lastBackPressed, setLastBackPressed] = useState(0);
  const [isIapTest, setIsIapTest] = useState(false);
  const { navigate, setWebViewRef, isOCRScreen, setIsOCRScreen, setOcrFilteredWords } = useNavigation();

  // webViewRef를 NavigationContext에 설정
  useEffect(() => {
    setWebViewRef(webViewRef);
  }, [setWebViewRef]);

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
  }, []);

  const handleExitApp = () => {
    const now = Date.now();
    if (lastBackPressed && (now - lastBackPressed) < 2000) {
      BackHandler.exitApp();
    } else {
      ToastAndroid.show('종료하려면 뒤로를 다시 누르세요..', ToastAndroid.SHORT);
      setLastBackPressed(now);
    }
  };

  console.log('FRONT_URL', FRONT_URL);

  return (
    <View style={[styles.container, { backgroundColor: '#fff' }]}> 
      <StatusBar 
        barStyle={'dark-content'}
        backgroundColor={'#fff'}
        translucent={false}
        hidden={false} 
      />
      {/* 웹뷰는 항상 렌더링 */}
      <WebView
        source={{ uri: FRONT_URL || '' }}
        ref={webViewRef}
        bounces={false}
        overScrollMode="never"
        userAgent="HeyVoca"
        onMessage={event => handleWebViewMessage(event, webViewRef, handleExitApp, setIsOCRScreen, setOcrFilteredWords)}
        javaScriptEnabled={true}
        webviewDebuggingEnabled={true}
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
      {/* OCR 카메라는 웹뷰 위에 오버레이로 표시 */}
      {isOCRScreen && (
        <View style={styles.ocrOverlay}>
          <OCRScreen />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  ocrOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});

export default HomeScreen;