import { Alert } from 'react-native';
import Tts from 'react-native-tts';
import { signInWithGoogle } from '../google/googleAuth';

const handleWebViewMessage = async (
  event: { nativeEvent: { data: string } }, 
  webViewRef: { current: any }, 
  handleExitApp: () => void
) => {
  const message = event.nativeEvent.data;
  if (message === 'launchGoogleAuth') {
    signInWithGoogle(webViewRef);
  } 
  // else if (message === 'logoutGoogleAuth') {
  //   signOutWithGoogle();
  // }  
  // else if (message === 'get_access_token') {
  //   refreshAccessToken(webViewRef);
  // } 
  // else if (message === 'request_google_permissions') {
  //   requestGooglePermissions(webViewRef);
  // } 
  else {
    try {
      const data = JSON.parse(message);
      if (data.type === 'tts') {
        Tts.stop();
        const language = data.language || 'en-US';
        Tts.setDefaultRate(0.45);
        Tts.setDefaultPitch(0.9);
        Tts.setDefaultLanguage(language);
        Tts.speak(data.text);
      } else if (data.type === 'loginSuccess') {
        const { accessToken, refreshToken } = data.data;
        refreshAccessToken(webViewRef, accessToken, refreshToken);
      } else if (data.type === 'isBackable') {
        if (data.value) {
          webViewRef.current.goBack();
        } else {
          handleExitApp();
        }
      } else if (data.type === 'log') {
        console.log('web log :', data.message);
      } else if (data.type === 'alert') {
        Alert.alert('', data.message, [{ text: 'OK' }], { cancelable: false });
      } else if (data.type === 'confirm') {
        Alert.alert('', data.message, [
          {
            text: data.btns[0].text,
            onPress: () =>
              webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: false })),
            style: 'cancel',
          },
          {
            text: data.btns[1].text,
            onPress: () =>
              webViewRef.current.postMessage(JSON.stringify({ type: "confirm_return", success: true, result: true })),
          },
        ], { cancelable: false });
      }
      // 필요시 기타 메시지 타입 추가
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
};

export default handleWebViewMessage;