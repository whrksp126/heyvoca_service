// OCRBoundingOverlay.tsx
// 하이라이트 오버레이 (((((보류)))))
import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Word {
  text: string;
  boundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface PhotoSize {
  width: number;
  height: number;
}

interface ScreenSize {
  width: number;
  height: number;
}

interface OCRBoundingOverlayProps {
  words: Word[];
  photoSize: PhotoSize;
  screenSize: ScreenSize;
}

/**
 * @param {Object[]} words - OCR 결과 배열 (text, boundingBox)
 * @param {Object} photoSize - { width, height } : 실제 촬영된 이미지 크기
 * @param {Object} screenSize - { width, height } : 화면 크기
 */
const OCRBoundingOverlay: React.FC<OCRBoundingOverlayProps> = ({ 
  words, 
  photoSize, 
  screenSize 
}) => {
  if (!words || words.length === 0) return null;

  // 🔧 1️⃣ contain 모드에서의 스케일 계산
  const imageRatio = photoSize.width / photoSize.height;
  const screenRatio = screenSize.width / screenSize.height;
  
  let scaleX, scaleY, offsetX, offsetY;
  
  if (imageRatio > screenRatio) {
    // 이미지가 화면보다 가로로 더 긴 경우
    scaleX = screenSize.width / photoSize.width;
    scaleY = scaleX;
    const scaledHeight = photoSize.height * scaleY;
    offsetX = 0;
    offsetY = (screenSize.height - scaledHeight) / 2;
  } else {
    // 이미지가 화면보다 세로로 더 긴 경우
    scaleY = screenSize.height / photoSize.height;
    scaleX = scaleY;
    const scaledWidth = photoSize.width * scaleX;
    offsetX = (screenSize.width - scaledWidth) / 2;
    offsetY = 0;
  }

  console.log('🔍 OCRBoundingOverlay 계산 정보:', {
    photoSize,
    screenSize,
    imageRatio: imageRatio.toFixed(3),
    screenRatio: screenRatio.toFixed(3),
    scaleX: scaleX.toFixed(3),
    scaleY: scaleY.toFixed(3),
    offsetX: offsetX.toFixed(1),
    offsetY: offsetY.toFixed(1),
    wordsCount: words.length
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {words.map((word: Word, idx: number) => {
        // 🔧 정확한 위치 계산
        const scaledLeft = offsetX + word.boundingBox.left * scaleX;
        const scaledTop = offsetY + word.boundingBox.top * scaleY;
        const scaledWidth = Math.max(1, word.boundingBox.width * scaleX); // 최소 1px 보장
        const scaledHeight = Math.max(1, word.boundingBox.height * scaleY); // 최소 1px 보장

        console.log(`📦 단어 ${idx} (${word.text}):`, {
          original: {
            left: word.boundingBox.left.toFixed(1),
            top: word.boundingBox.top.toFixed(1),
            width: word.boundingBox.width.toFixed(1),
            height: word.boundingBox.height.toFixed(1)
          },
          scaled: {
            left: scaledLeft.toFixed(1),
            top: scaledTop.toFixed(1),
            width: scaledWidth.toFixed(1),
            height: scaledHeight.toFixed(1)
          },
          scale: { scaleX: scaleX.toFixed(3), scaleY: scaleY.toFixed(3) },
          offset: { offsetX: offsetX.toFixed(1), offsetY: offsetY.toFixed(1) }
        });

        return (
          <View
            key={idx}
            style={[
              styles.box,
              {
                left: scaledLeft,
                top: scaledTop,
                width: scaledWidth,
                height: scaledHeight,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

export default OCRBoundingOverlay;

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#00FF00', // 더 밝은 초록색
    backgroundColor: 'rgba(0, 255, 0, 0.2)', // 약간 더 진한 배경
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3, // Android 그림자
  },
});
