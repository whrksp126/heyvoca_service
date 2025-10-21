// ocrHelper.ts
// ocr 분석 로직
import TextRecognition, { TextLine } from '@react-native-ml-kit/text-recognition';

/**
 * VisionCamera로 촬영한 이미지 경로를 MLKit OCR로 분석
 */
export const recognizeTextFromImage = async (imagePath: string) => {
  try {
    // ✅ 경로 수정: file:// 접두사 추가 (없을 경우만)
    const validPath = imagePath.startsWith('file://')
      ? imagePath
      : `file://${imagePath}`;

    const result = await TextRecognition.recognize(validPath);

    const words: {
      text: string;
      boundingBox: { left: number; top: number; width: number; height: number };
    }[] = [];

    result.blocks.forEach((block) => {
      block.lines.forEach((line: TextLine) => {
        line.elements.forEach((element) => {
          // 영어 단어만 추출
          if (/^[A-Za-z]+$/.test(element.text)) {
            words.push({
              text: element.text,
              boundingBox: element.frame ? {
                left: element.frame.left,
                top: element.frame.top,
                width: element.frame.width,
                height: element.frame.height,
              } : { left: 0, top: 0, width: 0, height: 0 },
            });
          }
        });
      });
    });

    console.log('✅ 인식된 단어 개수:', words.length);
    return words;
  } catch (error) {
    console.error('❌ OCR 인식 실패:', error);
    return [];
  }
};
