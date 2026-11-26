// 오늘 할 일 → 퀘스트 항목(퀘스트 버튼 배지·풀시트 공용). todayTasks 는 StatsContext 값.
export const getQuestItems = (todayTasks) => {
  if (!todayTasks) return [];
  const out = [];
  const wilted = todayTasks.wilted ?? { total: 0, done: 0 };
  const care = todayTasks.care ?? { total: 0, done: 0 };
  const seed = todayTasks.new_seed ?? { target: 0, done: 0 };
  if (wilted.total > 0) out.push({ key: 'wilted', title: '시듦 물주기', desc: '시들어 가는 단어를 다시 살려요', done: wilted.done, total: wilted.total });
  if (care.total > 0) out.push({ key: 'care', title: '오늘 돌봄 물주기', desc: '물이 필요한 단어를 복습해요', done: Math.max(care.done, care.studied_today ?? 0), total: care.total });
  if (seed.target > 0) out.push({ key: 'new_seed', title: '농장에 새 씨앗 심기', desc: '새 단어를 농장에 심어요', done: seed.done, total: seed.target });
  return out;
};
export const questRemaining = (items) => items.filter((q) => q.done < q.total).length;
