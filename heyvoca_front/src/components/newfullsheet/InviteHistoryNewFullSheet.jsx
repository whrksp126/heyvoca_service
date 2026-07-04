import React, { useEffect, useState } from 'react';
import { CaretLeft, Copy, EnvelopeSimple } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { getInvitesApi } from '../../api/auth';
import { vibrate, showToast } from '../../utils/osFunction';
import gem from '../../assets/images/gem.png';

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
};

// 마이페이지 초대하기 탭 — 내 초대 코드 + 초대 기록
const InviteHistoryNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { userProfile } = useUser();

  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const inviteCode = userProfile?.invite_code || '-';

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const result = await getInvitesApi();
        if (!isMounted) return;
        if (result?.code === 200) {
          setInvites(Array.isArray(result?.data?.invites) ? result.data.invites : []);
        } else {
          setInvites([]);
        }
      } catch (error) {
        if (isMounted) setInvites([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const handleCopyInviteCode = async () => {
    if (!userProfile?.invite_code) return;
    try {
      await navigator.clipboard.writeText(userProfile.invite_code);
      showToast('초대 코드가 복사되었습니다.');
    } catch (error) {
      // fallback: 텍스트 영역 생성하여 복사
      try {
        const textArea = document.createElement('textarea');
        textArea.value = userProfile.invite_code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('초대 코드가 복사되었습니다.');
      } catch (fallbackError) {
        console.error('복사 실패:', fallbackError);
        showToast('복사에 실패했습니다.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-[#ddd]"
      >
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          초대하기
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 내 초대 코드 */}
        <section className="px-[16px] pt-[20px] pb-[8px]">
          <div className="flex flex-col items-center gap-[12px] p-[24px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
            <span className="text-[13px] font-[500] text-layout-gray-300">내 초대 코드</span>
            <span className="text-[28px] font-[800] tracking-[4px] text-layout-black dark:text-layout-white">
              {inviteCode}
            </span>
            <motion.button
              type="button"
              onClick={() => { vibrate({ duration: 5 }); handleCopyInviteCode(); }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-[6px] px-[16px] py-[10px] rounded-[8px] bg-primary-main-600 text-layout-white text-[14px] font-[700]"
            >
              <Copy size={16} />
              코드 복사
            </motion.button>
            <p className="text-[12px] font-[400] text-layout-gray-300 text-center">
              친구가 이 코드를 입력하면 나와 친구 모두 보석 10개를 받아요!
            </p>
          </div>
        </section>

        {/* 초대 기록 */}
        <section className="flex flex-col gap-[12px] py-[20px]">
          <h3 className="px-[16px] text-[16px] font-[700] text-layout-black dark:text-layout-white">
            초대 기록
          </h3>
          {isLoading ? (
            <p className="px-[16px] py-[20px] text-center text-[14px] text-layout-gray-300">
              불러오는 중...
            </p>
          ) : invites.length === 0 ? (
            <div className="flex flex-col items-center gap-[8px] px-[16px] py-[30px]">
              <EnvelopeSimple size={32} className="text-layout-gray-200" />
              <p className="text-center text-[14px] text-layout-gray-300">
                아직 초대한 친구가 없어요.<br />코드를 공유하고 보석을 받아보세요!
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {invites.map((invite, idx) => (
                <li
                  key={`${invite.username}-${idx}`}
                  className="flex items-center justify-between px-[16px] py-[14px] border-b border-border dark:border-border-dark"
                >
                  <div className="flex flex-col gap-[2px] min-w-0">
                    <span className="text-[14px] font-[600] text-layout-black dark:text-layout-white truncate">
                      {invite.username}
                    </span>
                    <span className="text-[12px] font-[400] text-layout-gray-300">
                      {formatDate(invite.joined_at)} 가입
                    </span>
                  </div>
                  {invite.reward > 0 && (
                    <span className="flex items-center gap-[3px] text-[14px] font-[700] text-primary-main-600 shrink-0 pl-[10px]">
                      <img src={gem} alt="보석" className="w-[14px] h-[12px]" />
                      +{invite.reward}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default InviteHistoryNewFullSheet;
