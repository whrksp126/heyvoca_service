import { useEffect, useRef } from 'react';
import postMessageManager from '../utils/postMessageManager';
import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import { AlertNewBottomSheet } from '../components/newBottomSheet/AlertNewBottomSheet';

export const OAUTH_ERROR_TITLE = {
  cancelled: '로그인을 취소했어요',
  failed: '로그인하지 못했어요. 다시 시도해 주세요.',
};

/**
 * 앱 OAuth 취소·실패(앱 → 웹 'oauthError') 를 헤이보카 바텀시트로 알린다(이슈 #25 7차).
 * onError 는 시트를 띄우기 전에 불린다 — 화면이 로그인 처리 중 스플래시·로딩을 풀 자리.
 * 반환하는 showOAuthError(code) 는 웹 쪽 로그인 처리 실패에도 같은 시트를 쓰려고 내보낸다.
 */
export const useAppOAuthError = (onError) => {
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const showOAuthError = (code) => {
    pushNewBottomSheet(AlertNewBottomSheet, {
      title: OAUTH_ERROR_TITLE[code] ?? OAUTH_ERROR_TITLE.failed,
    }, {
      isBackdropClickClosable: true,
      isDragToCloseEnabled: true,
    });
  };
  const showRef = useRef(showOAuthError);
  showRef.current = showOAuthError;

  useEffect(() => {
    postMessageManager.setupAppOAuthError(({ code }) => {
      try { onErrorRef.current?.(code); } catch (e) { /* 화면 상태 해제 실패는 무시 */ }
      showRef.current(code);
    });
    return () => postMessageManager.removeAppOAuthError();
  }, []);

  return showOAuthError;
};
