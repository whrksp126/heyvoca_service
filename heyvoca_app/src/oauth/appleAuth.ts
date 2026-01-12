import appleAuth from '@invertase/react-native-apple-authentication';
import { Alert } from 'react-native';

export const signInWithApple = async (webViewRef: any) => {
    try {
        // Apple 로그인 요청 수행
        const appleAuthRequestResponse = await appleAuth.performRequest({
            requestedOperation: appleAuth.Operation.LOGIN,
            requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
        });

        console.log('Apple Auth Response', appleAuthRequestResponse);

        // 사용자 인증 상태 확인
        const credentialState = await appleAuth.getCredentialStateForUser(appleAuthRequestResponse.user);

        // 인증 상태가 유효한 경우 웹뷰로 데이터 전송
        if (credentialState === appleAuth.State.AUTHORIZED) {
            if (webViewRef.current) {
                const data = {
                    type: 'apple_oauth_app_callback',
                    identityToken: appleAuthRequestResponse.identityToken,
                    email: appleAuthRequestResponse.email, // 최초 로그인 시에만 제공됨
                    fullName: appleAuthRequestResponse.fullName, // 최초 로그인 시에만 제공됨
                    user: appleAuthRequestResponse.user, // Apple User ID
                    status: 200
                };
                console.log('Sending Apple Auth Data to WebView:', data);
                webViewRef.current.postMessage(JSON.stringify(data));
            }
        }
    } catch (error: any) {
        if (error.code === appleAuth.Error.CANCELED) {
            // 사용자가 취소한 경우
            return;
        }
        console.error('Apple Login Error:', error);
        Alert.alert('Apple Login Failed', error.message);
    }
};
