import { Alert } from 'react-native';
// import Tts from 'react-native-tts';
import { signInWithGoogle } from '../google/googleAuth';
import { executePurchase } from '../handlers/iapHandler';
import { saveCookieToAsyncStorage } from '../utils/asyncStorage';
const handleWebViewMessage = async (
  event: { nativeEvent: { data: string } }, 
  webViewRef: { current: any }, 
  handleExitApp: () => void
) => {
  try {
    const messageData = JSON.parse(event.nativeEvent.data);
    
    switch (messageData.type) {
      case 'launchGoogleAuth':
        signInWithGoogle(webViewRef);
        break;    
      case 'iapPurchase':
        executePurchase(messageData.props.itemId, webViewRef);
        break;
      case 'setCookie':
        // 웹에서 쿠키 동기화 메시지 받음
        const { name, value, expires } = messageData.props;
        saveCookieToAsyncStorage(name, value, expires);
        console.log('쿠키 동기화됨:', name, value);
        break;
 
      case 'log':
        console.log('web log :', messageData.message);
        break;
      case 'alert':
        Alert.alert('', messageData.message);
        break;  
      case 'confirm':
        Alert.alert('', messageData.message, [
          { text: messageData.btns[0].text, onPress: () => webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: false })), style: 'cancel' },
          { text: messageData.btns[1].text, onPress: () => webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: true })) },
        ], { cancelable: false });
        break;

      default:
        console.log('알 수 없는 메시지 타입:', messageData.type);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
  // if (messageData.type === 'launchGoogleAuth') {
  //   signInWithGoogle(webViewRef);
  //   return;
  // }


  // if (messageData.type === 'iapPurchase') {
  //   Alert.alert('iapPurchase');
  //   return;
  // }
  // try {
  //   const data = JSON.parse(messageData);
    
  //   switch (data.type) {

              
  //     // case 'iap_purchase':
  //     //   // 웹에서 인앱결제 요청
  //     //   const { productId } = data.data;
  //     //   break;
        
  //     // case 'loginSuccess':
  //     //   const { accessToken, refreshToken } = data.data;
  //     //   console.log('로그인 성공:', { accessToken, refreshToken });
  //     //   break;

  //     // case 'tts':
  //     //   Tts.stop();
  //     //   const language = data.language || 'en-US';
  //     //   Tts.setDefaultRate(0.45);
  //     //   Tts.setDefaultPitch(0.9);
  //     //   Tts.setDefaultLanguage(language);
  //     //   Tts.speak(data.text);
  //     //   break;
        
  //     // case 'isBackable':
  //     //   if (data.value) {
  //     //     webViewRef.current.goBack();
  //     //   } else {
  //     //     handleExitApp();
  //     //   }
  //     //   break;
        
  //     // case 'log':
  //     //   console.log('web log :', data.message);
  //     //   break;
        
  //     // case 'alert':
  //     //   Alert.alert('', data.message, [{ text: 'OK' }], { cancelable: false });
  //     //   break;
        
  //     // case 'confirm':
  //     //   Alert.alert('', data.message, [
  //     //     {
  //     //       text: data.btns[0].text,
  //     //       onPress: () =>
  //     //         webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: false })),
  //     //       style: 'cancel',
  //     //     },
  //     //     {
  //     //       text: data.btns[1].text,
  //     //       onPress: () =>
  //     //         webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: true })),
  //     //     },
  //     //   ], { cancelable: false });
  //     //   break;

  //     default:
  //       console.log('알 수 없는 메시지 타입:', data.type);
  //   }
  // } catch (error) {
  //   console.error('Error parsing message:', error);
  // }
};

export default handleWebViewMessage;