import { getUserVocabularySheetsApi, deleteUserVocabularySheetApi, addUserVocabularySheetApi, updateUserVocabularySheetApi } from '../api/voca';

const COLOR_MAP = {
    '800점': { main: '#6B8AFF', sub: '#6B8AFF4d', background: '#EFF2FF' }, // Blue
    '900점': { main: '#FF70D4', sub: '#FF70D44d', background: 'var(--primary-main-100)' }, // Pink
    '토익 기초': { main: '#5CD97C', sub: '#5CD97C4d', background: '#EFFFEE' }, // Green
    '핵심 빈출': { main: '#FFB85C', sub: '#FFB85C4d', background: '#FFF7EF' }, // Orange
};

const DEFAULT_COLOR = { main: '#A45CFF', sub: '#A45CFF4d', background: '#F8EFFF' }; // Purple

export const loadDummyVocabularies = async (onProgress) => {
    try {
        // 1. 기존 단어장 삭제
        if (onProgress) onProgress(0, 0, '기존 단어장 삭제 중...');
        const listRes = await getUserVocabularySheetsApi();
        if (listRes && listRes.code === 200 && listRes.data) {
            for (const item of listRes.data) {
                await deleteUserVocabularySheetApi(item.id);
            }
        }

        // 2. manifest.json 로드
        const response = await fetch('/dummy_vocalist/manifest.json');
        const manifest = await response.json();

        const total = manifest.length;
        let count = 0;

        for (const filename of manifest) {
            count++;

            // 3. 개별 단어장 데이터 로드
            const vocaRes = await fetch(`/dummy_vocalist/${filename}`);
            const words = await vocaRes.json();

            // 4. 제목 및 색상 결정
            const rawTitle = filename.replace('.json', '');
            const title = rawTitle.replace(/_/g, ' '); // 언더바를 공백으로

            if (onProgress) onProgress(count, total, title);

            // 한글 인코딩(NFC/NFD) 문제 방지를 위해 정규화 후 체크
            const normalizedTitle = title.normalize('NFC');
            let color = DEFAULT_COLOR;
            for (const key in COLOR_MAP) {
                if (normalizedTitle.includes(key.normalize('NFC'))) {
                    color = COLOR_MAP[key];
                    break;
                }
            }

            // 5. 단어장 생성
            const createRes = await addUserVocabularySheetApi({
                title,
                color
            });

            if (createRes && createRes.code === 200) {
                const bookId = createRes.data.id;

                // 6. 단어 추가 (PATCH update)
                await updateUserVocabularySheetApi(bookId, {
                    words,
                    total: words.length
                });
            } else {
                console.error(`Failed to create vocabulary sheet: ${title}`, createRes);
            }
        }

        return { success: true, count };
    } catch (error) {
        console.error('Error loading dummy vocabularies:', error);
        return { success: false, error };
    }
};
