// 시트/모달 컴포넌트 -> 안정적인 식별 이름(파일명) 레지스트리.
// 함수 name 은 minify 로 바뀌므로 쓰지 않고, 빌드 시점에 확정되는 파일 경로(import.meta.glob)에서 이름을 얻는다.
const modules = {
  ...import.meta.glob('../components/**/*Sheet.jsx', { eager: true }),
  ...import.meta.glob('../components/overlay/*.jsx', { eager: true }),
  ...import.meta.glob('../components/newBottomSheet/*.jsx', { eager: true }),
  ...import.meta.glob('../components/newfullsheet/*.jsx', { eager: true }),
};

const registry = new Map();
Object.entries(modules).forEach(([path, mod]) => {
  const name = path.split('/').pop().replace(/\.jsx$/, '');
  Object.values(mod || {}).forEach((v) => {
    if (v && (typeof v === 'function' || typeof v === 'object') && !registry.has(v)) registry.set(v, name);
  });
});

export function getSheetName(component, options) {
  return options?.analyticsName || registry.get(component) || 'unknown';
}
