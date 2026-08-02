import React, { useEffect, useState } from 'react';
import { SignOut, PencilSimple, CaretRight } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { LogoutNewBottomSheet } from '../newBottomSheet/LogoutNewBottomSheet';
import { WithdrawNewBottomSheet } from '../newBottomSheet/WithdrawNewBottomSheet';
import { NicknameEditNewBottomSheet } from '../newBottomSheet/NicknameEditNewBottomSheet';
import { useUser } from '../../context/UserContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { withdrawApi } from '../../api/auth';
import { getFarmOverviewApi } from '../../api/farm';
import { setCookie } from '../../utils/common';
import { launchGoogleWithdraw, showToast, vibrate, getDevicePlatform } from '../../utils/osFunction';
import { SheetBar } from './settingsUi';

/**
 * 계정 — 무엇을 잃는지 먼저 보인다 (시안 설정 1절 ④).
 * 계정 화면이 곧 탈퇴하면 사라질 것의 목록이 된다.
 * 분홍은 닉네임 연필 하나뿐이다 — 이 화면에서 유일하게 고칠 수 있는 값이다 (시안 6절).
 */
const AccountNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet, pushAwaitNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const { userProfile, setIsWithdrawInProgress, updateUserProfile, loginProvider } = useUser();
  const { vocabularySheets } = useVocabulary();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [farmSummary, setFarmSummary] = useState(null);

  // "이 계정의 농장" — 탈퇴 확인 시트가 그대로 다시 쓰는 숫자들이다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getFarmOverviewApi();
      if (!alive || res?.code !== 200) return;
      const counts = res.data?.counts || {};
      const items = res.data?.items || {};
      setFarmSummary({
        plants: ['seed', 'sprout', 'leaf', 'carrot'].reduce((sum, k) => sum + (counts[k] || 0), 0),
        golden: counts.golden || 0,
        streakCurrent: res.data?.streak?.current || 0,
        streakBest: res.data?.streak?.best || 0,
        tools: Object.values(items).reduce((sum, n) => sum + (n || 0), 0),
      });
    })();
    return () => { alive = false; };
  }, []);

  const handleNicknameEdit = async () => {
    const newNickname = await pushAwaitNewBottomSheet(
      NicknameEditNewBottomSheet,
      { initialNickname: userProfile?.username || '' },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
    if (!newNickname || newNickname === userProfile?.username) return;
    try {
      await updateUserProfile({ username: newNickname });
      showToast('닉네임이 변경되었습니다.');
    } catch (error) {
      console.error('닉네임 변경 실패:', error);
      showToast('닉네임 변경에 실패했습니다.');
    }
  }

  const handleLogout = () => {
    pushNewBottomSheet(
      LogoutNewBottomSheet,
      {},
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
  }

  const handleWithdraw = async () => {
    try {
      // 확인 BottomSheet 표시 — "모든 데이터"가 아니라 숫자로 적는다 (시안 4절)
      const confirmed = await pushAwaitNewBottomSheet(
        WithdrawNewBottomSheet,
        {
          plants: farmSummary?.plants,
          golden: farmSummary?.golden,
          streakCurrent: farmSummary?.streakCurrent,
          streakBest: farmSummary?.streakBest,
          tools: farmSummary?.tools,
          gem: userProfile?.gem_cnt ?? 0,
        },
        {
          isBackdropClickClosable: true,
          isDragToCloseEnabled: true
        }
      );

      if (!confirmed) {
        return; // 취소한 경우
      }

      setIsWithdrawing(true);

      // 회원 탈퇴 프로세스 시작 표시 (로그아웃과 동일한 앱 콜백을 구분하기 위함)
      setIsWithdrawInProgress(true);

      const platform = getDevicePlatform();

      if (platform !== 'web') {
        // 앱 환경 — 로그인 방식에 따라 분기해야 한다.
        // 애플 로그인 사용자는 구글 세션이 없어 launchGoogleWithdraw()가 트리거하는
        // GoogleSignin.signOut()이 실패(callback status≠200)한다. 그 결과 UserContext의
        // handleAppGoogleAccountAction이 status===200 게이트를 통과하지 못해 performWithdraw가
        // 아예 실행되지 않고 탈퇴가 중단된다. 애플 사용자는 이 구글 로그아웃 채널을 타지 않고
        // 웹과 동일하게 withdrawApi를 직접 호출해 탈퇴를 완료시킨다.
        if (loginProvider === 'apple') {
          const result = await withdrawApi();

          if (result.code !== 200) {
            alert('회원 탈퇴 중 오류가 발생하였습니다.');
            setIsWithdrawing(false);
            setIsWithdrawInProgress(false);
            return;
          }

          localStorage.clear();
          sessionStorage.clear();
          setCookie('userAccessToken', '', -1);
          clearNewBottomSheetStack();
          clearNewFullSheetStack();
          window.location.href = '/login';
          return;
        }

        // 구글 로그인(또는 로그인 방식을 알 수 없는 경우) — 기존 앱 구글 계정 선택 팝업 흐름 유지.
        // 앱에서 google_logout_app_callback(status:200)을 받으면
        // UserContext.handleAppGoogleAccountAction이 isWithdrawInProgress를 보고 performWithdraw를 실행한다.
        await launchGoogleWithdraw();
        return;
      }

      // 웹 환경인 경우 회원 탈퇴 처리
      const result = await withdrawApi();

      if (result.code !== 200) {
        alert('회원 탈퇴 중 오류가 발생하였습니다.');
        setIsWithdrawing(false);
        setIsWithdrawInProgress(false);
        return;
      }

      // 모든 캐시 및 저장소 삭제
      localStorage.clear();
      sessionStorage.clear();
      setCookie('userAccessToken', '', -1);

      // 컨텍스트 초기화
      clearNewBottomSheetStack();
      clearNewFullSheetStack();

      // 강제로 로그인 페이지로 이동 (캐시 무시)
      window.location.href = '/login';
    } catch (error) {
      console.error('회원 탈퇴 실패:', error);
      alert('회원 탈퇴 중 오류가 발생하였습니다.');
      setIsWithdrawing(false);
      setIsWithdrawInProgress(false);
    }
  }

  // 함께한 날 — 가입일로부터 며칠째인지 (시안 설정 ④ · 4절).
  // 백엔드 /get_user_info 응답에 가입일이 없다(User.created_at 은 DB 에만 있다).
  // 값이 실릴 때만 줄이 뜬다 — 필드가 추가되면 코드 변경 없이 그대로 켜진다.
  const daysTogether = (() => {
    const raw = userProfile?.created_at;
    if (!raw) return null;
    const s = String(raw);
    // 백엔드 created_at 은 timezone 없는 UTC — 로컬 표시를 위해 Z 보정
    const t = new Date(/[Z+]|-\d{2}:\d{2}$/.test(s.slice(10)) ? s : `${s}Z`);
    if (Number.isNaN(t.getTime())) return null;
    return Math.max(1, Math.floor((Date.now() - t.getTime()) / 86400000) + 1);
  })();

  const rowCls = 'flex items-center gap-[10px] px-[14px] py-[13px]';
  const keyCls = 'w-[82px] shrink-0 text-[12px] font-[700] tracking-[-0.02em] text-layout-gray-300';
  const valCls = 'flex-1 min-w-0 text-[13.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white truncate';
  const divider = 'border-t border-[rgba(0,0,0,.05)] dark:border-[rgba(255,255,255,.07)]';

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <SheetBar title="계정" />

      <div className="flex-1 overflow-y-auto flex flex-col gap-[14px] px-[16px] pb-[20px]">
        {/* ── 계정 값 ── */}
        <div className="rounded-[14px] overflow-hidden bg-layout-gray-50 dark:bg-layout-gray-dark">
          <div
            className={rowCls}
            onClick={() => { vibrate({ duration: 5 }); handleNicknameEdit(); }}
          >
            <span className={keyCls}>닉네임</span>
            <span className={valCls}>{userProfile?.username || '미설정'}</span>
            <PencilSimple size={16} className="shrink-0 text-primary-main-600" />
          </div>
          <div className={`${rowCls} ${divider}`}>
            <span className={keyCls}>로그인</span>
            <span className={valCls}>{loginProvider === 'apple' ? 'Apple 로그인' : 'Google 로그인'}</span>
          </div>
          <div className={`${rowCls} ${divider}`}>
            <span className={keyCls}>이메일</span>
            <span className={valCls}>{userProfile?.email || '로그인 필요'}</span>
          </div>
          {daysTogether !== null && (
            <div className={`${rowCls} ${divider}`}>
              <span className={keyCls}>함께한 날</span>
              <span className={valCls}>{daysTogether}일째</span>
            </div>
          )}
        </div>

        {/* ── 이 계정의 농장 — 탈퇴하면 사라질 것의 목록 ── */}
        {farmSummary && (
          <div className="rounded-[14px] p-[14px] bg-[#FBF6EC] dark:bg-secondary-yellow-dark">
            <div className="text-[12px] font-[700] tracking-[-0.02em] text-[#9A7B4F] dark:text-[#D6BB8E]">
              이 계정의 농장
            </div>
            <div className="mt-[6px] text-[10.5px] leading-[1.65] tracking-[-0.02em] text-layout-gray-300">
              기른 작물 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{farmSummary.plants}</b>
              {' · '}황금 당근 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{farmSummary.golden}</b>
              {' · '}단어장 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{vocabularySheets?.length ?? 0}</b>
              <br />
              연속 학습 최고 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{farmSummary.streakBest}일</b>
              {' · '}보석 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{userProfile?.gem_cnt ?? 0}</b>
            </div>
          </div>
        )}

        {/* ── 로그아웃 ── */}
        <div
          onClick={() => { vibrate({ duration: 5 }); handleLogout(); }}
          className="flex items-center gap-[10px] px-[14px] py-[13px] rounded-[14px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          <SignOut size={17} className="shrink-0 text-layout-gray-400" />
          <span className="flex-1 text-[13.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
            로그아웃
          </span>
          <CaretRight size={13} className="shrink-0 text-layout-gray-200" />
        </div>

        {/* ── 회원 탈퇴 — 눈에 띄지 않는 밑줄 한 줄 (시안 .danger) ── */}
        <button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); handleWithdraw(); }}
          disabled={isWithdrawing}
          className="pt-[18px] pb-[4px] text-center text-[12px] font-[600] text-layout-gray-300 underline disabled:opacity-50"
        >
          {isWithdrawing ? '처리 중...' : '회원 탈퇴'}
        </button>
      </div>
    </div>
  );
};

export default AccountNewFullSheet;
