import React, { useEffect, useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { GemPurchaseNewBottomSheet } from '../newBottomSheet/GemPurchaseNewBottomSheet';
import { getGemHistoryApi } from '../../api/store';
import { vibrate } from '../../utils/osFunction';
import gem from '../../assets/images/gem.png';

// GemReason → 표시 라벨 (description이 없을 때 폴백)
const REASON_LABEL = {
  IAP_PURCHASE: '보석 충전',
  BOOK_PURCHASE: '단어장 구매',
  ACHIEVEMENT: '업적 보상',
  ADMIN_ADJUST: '관리자 조정',
  REFUND: '환불',
  REFERRAL: '초대 보상',
};

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
};

// 마이페이지 보석 탭 — 보유 보석 + 보석 내역만 표시 (구매는 바텀시트로 분리)
const GemNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { userProfile } = useUser();

  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const result = await getGemHistoryApi(1, 30);
        if (!isMounted) return;
        if (result?.code === 200) {
          setLogs(Array.isArray(result?.data?.logs) ? result.data.logs : []);
        } else {
          setLogs([]);
        }
      } catch (error) {
        if (isMounted) setLogs([]);
      } finally {
        if (isMounted) setIsLoadingLogs(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const handlePurchaseClick = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(
      GemPurchaseNewBottomSheet,
      {},
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="
          relative
          flex items-center justify-between
          h-[55px]
          pt-[20px] px-[16px] pb-[14px]
          border-b border-[#ddd]
        "
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
          보석
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 보유 보석 + 구매 버튼 */}
        <section className="px-[16px] pt-[20px] pb-[8px]">
          <div className="flex items-center justify-between p-[20px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
            <div className="flex flex-col">
              <span className="text-[12px] font-[500] text-layout-gray-300">보유 보석</span>
              <span className="text-[24px] font-[700] text-layout-black dark:text-layout-white leading-tight">
                {userProfile?.gem_cnt ?? 0}
              </span>
            </div>
            <motion.button
              type="button"
              onClick={handlePurchaseClick}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-[6px] px-[16px] py-[10px] rounded-[8px] bg-primary-main-600 text-layout-white text-[14px] font-[700]"
            >
              <img src={gem} alt="보석" className="w-[18px] h-[16px]" />
              보석 구매
            </motion.button>
          </div>
        </section>

        {/* 사용/적립 내역 */}
        <section className="flex flex-col gap-[12px] py-[20px]">
          <h3 className="px-[16px] text-[16px] font-[700] text-layout-black dark:text-layout-white">
            보석 내역
          </h3>
          {isLoadingLogs ? (
            <p className="px-[16px] py-[20px] text-center text-[14px] text-layout-gray-300">
              불러오는 중...
            </p>
          ) : logs.length === 0 ? (
            <p className="px-[16px] py-[20px] text-center text-[14px] text-layout-gray-300">
              보석 내역이 없어요.
            </p>
          ) : (
            <ul className="flex flex-col">
              {logs.map((log) => {
                const earned = log.amount >= 0;
                return (
                  <li
                    key={log.id}
                    className="flex items-center justify-between px-[16px] py-[14px] border-b border-border dark:border-border-dark"
                  >
                    <div className="flex flex-col gap-[2px] min-w-0">
                      <span className="text-[14px] font-[600] text-layout-black dark:text-layout-white truncate">
                        {log.description || REASON_LABEL[log.reason] || '보석'}
                      </span>
                      <span className="text-[12px] font-[400] text-layout-gray-300">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-[2px] shrink-0 pl-[10px]">
                      <span
                        className={`flex items-center gap-[3px] text-[14px] font-[700] ${
                          earned ? 'text-primary-main-600' : 'text-layout-gray-400'
                        }`}
                      >
                        <img src={gem} alt="보석" className="w-[14px] h-[12px]" />
                        {earned ? '+' : ''}{log.amount}
                      </span>
                      {typeof log.balance_after === 'number' && (
                        <span className="text-[12px] font-[400] text-layout-gray-300">
                          잔액 {log.balance_after}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default GemNewFullSheet;
