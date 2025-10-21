import Config from 'react-native-config';

const GOOGLE_CLIENT_ANDROID_ID = Config.GOOGLE_CLIENT_ANDROID_ID;
const GOOGLE_CLIENT_IOS_ID = Config.GOOGLE_CLIENT_IOS_ID;
const GOOGLE_CLIENT_WEB_ID = Config.GOOGLE_CLIENT_WEB_ID;
import { Platform } from 'react-native';
const FRONT_URL = Config.APP_ENV === 'local' && Platform.OS === 'android' ? Config.ANDROID_FRONT_URL : Config.FRONT_URL;

import { Alert } from 'react-native';
import { appAsyncStore, saveAppAsyncStorage, clearAppAsyncStorage, updateAppAsyncStorage } from '../utils/asyncStorage';

let GoogleSignin;
let statusCodes;

const { GoogleSignin: GS, statusCodes: SC } = require('@react-native-google-signin/google-signin');
GoogleSignin = GS;
statusCodes = SC;

GoogleSignin.configure({
  webClientId: GOOGLE_CLIENT_WEB_ID,
  iosClientId: GOOGLE_CLIENT_IOS_ID,
  offlineAccess: false, 
  scopes: ['profile', 'email'],
});

export const signInWithGoogle = async (webViewRef: any) => {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    console.log('userInfo', userInfo);
    if (webViewRef.current) {

      const data = {
        type: 'google_oauth_app_callback',
        googleId: userInfo.user.id || '',
        email: userInfo.user.email || '',
        name: userInfo.user.name || '',
        loginType: 'app',
        status: 200,
      };
      console.log('전송 데이터', data);
      webViewRef.current.postMessage(JSON.stringify(data));

      // const newUrl = `${FRONT_URL}/login?&googleId=${userInfo.data.user.id}&email=${userInfo.data.user.email}&name=${userInfo.data.user.name}&type=app&status=200`;
      // const script = `window.location.href = '${newUrl}';`;
      // webViewRef.current.injectJavaScript(script);
    }
  } catch (error) {
    handleSignInError(error);
  }
};

// export const signOutWithGoogle = async () => {
//   try {
//     await GoogleSignin.signOut();
//     await clearAppAsyncStorage();
//     console.log("사용자 로그아웃 및 데이터 초기화 완료");
//   } catch (error) {
//     console.error('로그아웃 실패:', error);
//   }
// };

export const handleSignInError = (error) => {
  console.error('전체 에러 객체:', error);

  if (error.code === statusCodes.SIGN_IN_CANCELLED) {
    Alert.alert('', '사용자가 로그인 흐름을 취소했습니다', [{ text: 'OK' }], { cancelable: false });
  } else if (error.code === statusCodes.IN_PROGRESS) {
    Alert.alert('', '로그인 진행 중', [{ text: 'OK' }], { cancelable: false });
  } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    Alert.alert('', 'Play 서비스를 사용할 수 없거나 오래되었습니다', [{ text: 'OK' }], { cancelable: false });
  } else if (error.code === statusCodes.DEVELOPER_ERROR) {
    Alert.alert('', '로그인에 실패했습니다. 관리자에게 문의하세요.', [{ text: 'OK' }], { cancelable: false });
  } else {
    Alert.alert('', `로그인 실패: ${error.message}`, [{ text: 'OK' }], { cancelable: false });
  }
};

// // 액세스 토큰 갱신
// export async function refreshAccessToken(webViewRef, accessToken, refreshToken) {
//   try {
//     appAsyncStore.accessToken = accessToken; // 액세스 토큰 저장
//     appAsyncStore.refreshToken = refreshToken; // 리프레시 토큰 저장

//     // await updateAppAsyncStorage('accessToken', accessToken);
//     // await updateAppAsyncStorage('refreshToken', refreshToken);
//     // await saveAppAsyncStorage(); // 앱에 저장

//     webViewRef.current.postMessage(JSON.stringify({ // 프론트엔드에 토큰 전송
//       type: 'access_token_return',
//       data: {
//         accessToken: accessToken,
//         refreshToken: refreshToken,
//       },
//     }));
//   } catch (error) {
//     console.error("액세스 토큰 갱신 실패:", error);
//   }
// }

// export const requestGooglePermissions = async (webViewRef) => {
//   try {
//     await GoogleSignin.signOut();
//     await GoogleSignin.clearCachedAccessToken(appAsyncStore.accessToken);
//     await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
//     const userInfo = await GoogleSignin.signIn();
//     // appAsyncStore.googleId = userInfo.data.user.id;
//     // appAsyncStore.email = userInfo.data.user.email;
//     // appAsyncStore.name = userInfo.data.user.name;
//     // appAsyncStore.accessToken = userInfo.data.idToken;
//     // appAsyncStore.refreshToken = userInfo.data.serverAuthCode;
//     // await saveAppAsyncStorage();
//     webViewRef.current.postMessage(JSON.stringify({
//       type: 'return_google_permissions',
//       success: true,
//     }));
//     return;
//   } catch (error) {
//     console.error('구글 권한 요청 실패:', error);
//     webViewRef.current.postMessage(JSON.stringify({
//       type: 'return_google_permissions',
//       success: false,
//     }));
//     return;
//   }
// };