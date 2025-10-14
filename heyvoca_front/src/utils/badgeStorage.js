// badgeStorage.js
const KEY = 'heyvoca.lastSeenTime';

export function getLastSeenTime() {
  const v = localStorage.getItem(KEY);
  return v ? Number(v) : 0;
}

export function setLastSeenTime(ts) {
  localStorage.setItem(KEY, String(ts));
}
