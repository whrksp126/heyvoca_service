import { openExternalUrl } from '../../utils/osFunction';

export default function UpdateModal({ mode, platform, storeUrl, onLater }) {
  const isForce = mode === 'force';

  const handleUpdate = () => {
    if (storeUrl) openExternalUrl(storeUrl);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-center text-lg font-bold text-gray-900">
          {isForce ? '업데이트가 필요합니다' : '새로운 버전이 있어요'}
        </h2>
        <p className="mt-3 text-center text-sm leading-relaxed text-gray-600">
          {isForce
            ? '원활한 서비스 이용을 위해 최신 버전으로 업데이트 후 다시 실행해 주세요.'
            : '더 나은 사용을 위해 최신 버전으로 업데이트를 권장드려요.'}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleUpdate}
            className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white active:bg-blue-700"
          >
            지금 업데이트
          </button>
          {!isForce && (
            <button
              type="button"
              onClick={onLater}
              className="h-12 w-full rounded-xl bg-gray-100 text-base font-medium text-gray-700 active:bg-gray-200"
            >
              나중에
            </button>
          )}
        </div>

        {platform && (
          <p className="mt-3 text-center text-xs text-gray-400">
            {platform === 'iOS' ? 'App Store' : 'Google Play'}로 이동합니다
          </p>
        )}
      </div>
    </div>
  );
}
