/**
 * @typedef {Object} PageInfo
 * @property {string} path - 페이지 경로
 * @property {number} timestamp - 타임스탬프
 */

/**
 * 앱 전체의 페이지 히스토리를 관리하는 유틸리티
 * sessionStorage를 사용하여 페이지 새로고침 후에도 히스토리 유지
 */
export const AppHistory = {
  /**
   * 새로운 페이지를 히스토리에 추가
   * @param {Object} pageInfo - 페이지 정보
   * @param {string} pageInfo.path - 페이지 경로
   */
  push(pageInfo) {
    const history = JSON.parse(sessionStorage.getItem('appHistory') || '[]');
    history.push({
      ...pageInfo,
      timestamp: Date.now()
    });

    sessionStorage.setItem('appHistory', JSON.stringify(history));
  },
  
  /**
   * 히스토리에서 마지막 페이지를 제거하고 남아있는 마지막 페이지 반환
   * @returns {PageInfo|null} 남아있는 마지막 페이지 정보 또는 null
   */
  pop() {
    const history = JSON.parse(sessionStorage.getItem('appHistory') || '[]');
    if (history.length > 0) {
      history.pop(); // 제거만 하고
      sessionStorage.setItem('appHistory', JSON.stringify(history));
      // 남아있는 마지막 페이지 반환
      return history.length > 0 ? history[history.length - 1] : null;
    }
    return null;
  },
  
  /**
   * 뒤로가기 가능 여부 확인
   * @returns {boolean} 뒤로가기 가능하면 true
   */
  canGoBack() {
    const history = JSON.parse(sessionStorage.getItem('appHistory') || '[]');
    return history.length > 0;
  },
  
  /**
   * 현재 히스토리 전체 반환
   * @returns {PageInfo[]} 히스토리 배열
   */
  getCurrentHistory() {
    return JSON.parse(sessionStorage.getItem('appHistory') || '[]');
  },

  /**
   * 현재 페이지 경로 반환
   * @returns {string} 현재 페이지 경로
   */
  getCurrentPath() {
    return window.location.pathname;
  }
};
  