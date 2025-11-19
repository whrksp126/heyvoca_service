// OCRCamera.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert, Dimensions, Linking, Image, ScrollView } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import type { Camera as CameraType } from 'react-native-vision-camera';
import { recognizeTextFromImage } from '../components/ocrHelper';
import { useNavigation } from '../contexts/NavigationContext';
// import OCRBoundingOverlay from '../components/OCRBoundingOverlay';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const OCRCamera: React.FC = () => {
  const camera = useRef<CameraType>(null);
  const device = useCameraDevice('back'); // ✅ 더 안전한 방식
  const { goBack, webViewRef, setIsOCRScreen, ocrFilteredWords, setOcrFilteredWords } = useNavigation();

  const [hasPermission, setHasPermission] = useState(false);
  const [isPreview, setIsPreview] = useState(false); // ✅ 촬영 후 이미지 미리보기 모드
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const [words, setWords] = useState<any[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);
  // ✅ 미리보기 크기는 화면 크기와 동일 (contain 모드에서 자동 조정)

  // ✅ 권한 요청
  useEffect(() => {
    const requestPermission = async () => {
      const status = await Camera.requestCameraPermission();
      if (status.toString() === 'granted') {
        setHasPermission(true);
      } else {
        Alert.alert(
          '카메라 권한 필요',
          '카메라를 사용하려면 권한이 필요합니다. 설정으로 이동하시겠습니까?',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정으로 이동', onPress: () => Linking.openSettings() },
          ]
        );
      }
    };
    requestPermission();
  }, []);

  // ✅ 웹뷰에서 정제된 단어 받기 (Context를 통해)
  useEffect(() => {
    // 필터링 중일 때만 처리 (초기 렌더링 시 빈 배열은 무시)
    if (isFiltering) {
      console.log('✅ OCR 처리 완료! 정제된 단어 개수:', ocrFilteredWords.length);
      console.log('정제된 단어 목록:', ocrFilteredWords);
      setIsFiltering(false);
    }
  }, [ocrFilteredWords, isFiltering]);

  // ✅ 촬영
  const takePhoto = async () => {
    if (!camera.current) return;
    try {
      const photo = await camera.current.takePhoto();
      const fileUri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      console.log('📷 촬영 완료:', fileUri);

      const recognizedWords = await recognizeTextFromImage(fileUri);
      setWords(recognizedWords);
      setPhotoUri(fileUri);
      setPhotoSize({ width: photo.width, height: photo.height });
      setIsPreview(true); // ✅ 미리보기 모드로 전환
      
      // 웹뷰로 단어 전달하여 필터링 요청
      if (webViewRef?.current) {
        setIsFiltering(true);
        setOcrFilteredWords([]); // 이전 필터링 결과 초기화
        console.log('📤 웹뷰로 OCR 결과 전송 (필터링 요청)');
        console.log('   인식된 단어 개수:', recognizedWords.length);
        console.log('   인식된 단어:', recognizedWords.map(w => w.text).join(', '));
        webViewRef.current.postMessage(JSON.stringify({
          type: 'ocrResult',
          data: {
            words: recognizedWords,
            photoUri: fileUri,
            photoSize: { width: photo.width, height: photo.height }
          }
        }));
        console.log('⏳ 웹뷰 응답 대기 중... (filteredWords 메시지 기다림)');
      }
    } catch (err) {
      console.error('❌ 사진 촬영 실패:', err);
      Alert.alert('오류', '사진 촬영에 실패했습니다.');
    }
    
  };

  // ✅ 다시 촬영
  const retakePhoto = () => {
    setIsPreview(false);
    setPhotoUri(null);
    setWords([]);
    setOcrFilteredWords([]);
    setIsFiltering(false);
  };

  // ✅ 웹뷰로 결과 전달
  const sendResultToWebView = () => {
    if (webViewRef?.current) {
      const result = {
        type: 'ocrResult',
        data: {
          words: words,
          photoUri: photoUri,
          photoSize: photoSize
        }
      };
      webViewRef.current.postMessage(JSON.stringify(result));
    }
    setIsOCRScreen(false); // OCR 화면 닫기
  };

  // ✅ OCR 화면 닫기
  const closeOCRScreen = () => {
    setIsPreview(false);
    setPhotoUri(null);
    setWords([]);
    setOcrFilteredWords([]);
    setIsFiltering(false);
    setIsOCRScreen(false);
  };

  // ✅ 로딩 상태 처리
  if (!device)
    return <Text style={styles.infoText}>카메라 장치를 불러오는 중...</Text>;
  if (!hasPermission)
    return <Text style={styles.infoText}>카메라 권한이 필요합니다.</Text>;
  return (
    <View style={styles.container}>
      {/* ✅ 촬영 전 (카메라 프리뷰) */}
      {!isPreview ? (
        <>
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!isPreview}
            photo={true}
          />
          {/* 뒤로가기 버튼 */}
          <View style={styles.backButtonContainer}>
            <TouchableOpacity style={styles.backButton} onPress={closeOCRScreen}>
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.captureButtonContainer}>
            <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
              <Text style={styles.buttonText}>촬영</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* ✅ 촬영 후 결과 화면 */
        <View style={styles.resultContainer}>
          {/* 뒤로가기 버튼 */}
          <View style={styles.resultBackButtonContainer}>
            <TouchableOpacity style={styles.resultBackButton} onPress={closeOCRScreen}>
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
          </View>
          {/* 🔹 상단: 이미지 + 하이라이트 */}
          <View style={styles.imageContainer}>
            {photoUri && (
              <>
                <Image
                  source={{ uri: photoUri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
                {/* <OCRBoundingOverlay
                  words={words}
                  photoSize={photoSize}
                  screenSize={{ width: screenWidth, height: screenHeight * 0.6 }}
                /> */}
              </>
            )}
          </View>

          {/* 🔹 하단: 인식된 단어 리스트 */}
          <View style={styles.wordListContainer}>
            <Text style={styles.listTitle}>
              {isFiltering ? '🔄 단어 필터링 중...' : '📘 정제된 단어'}
            </Text>
            {isFiltering ? (
              <Text style={styles.loadingText}>웹에서 DB 단어를 필터링하고 있습니다...</Text>
            ) : ocrFilteredWords.length === 0 && words.length === 0 ? (
              <Text style={styles.emptyText}>인식된 단어가 없습니다.</Text>
            ) : ocrFilteredWords.length === 0 && words.length > 0 ? (
              <Text style={styles.emptyText}>DB에 있는 단어가 없습니다.</Text>
            ) : (
              <ScrollView style={styles.scrollList}>
                {ocrFilteredWords.map((item, idx) => {
                  // meanings를 안전하게 문자열로 변환
                  const getMeaningsText = () => {
                    if (!item.meanings || !Array.isArray(item.meanings) || item.meanings.length === 0) {
                      return '';
                    }
                    return item.meanings
                      .slice(0, 2)
                      .map((m: any) => typeof m === 'string' ? m : m.meaning || m.text || JSON.stringify(m))
                      .join(', ');
                  };

                  return (
                    <View key={item.id || idx} style={styles.wordItemContainer}>
                      <Text style={styles.wordText}>{item.word || '(단어 없음)'}</Text>
                      {getMeaningsText() && (
                        <Text style={styles.meaningText} numberOfLines={2}>
                          {getMeaningsText()}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
                <Text style={styles.buttonText}>다시 촬영</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.completeButton} onPress={sendResultToWebView}>
                <Text style={styles.buttonText}>완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default OCRCamera;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  infoText: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#999',
    fontSize: 16,
  },
  backButtonContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
  },
  backButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  resultBackButtonContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
  },
  resultBackButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonContainer: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
  },
  captureButton: {
    backgroundColor: '#00BFFF',
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  imageContainer: {
    flex: 6, // 상단 60%
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wordListContainer: {
    flex: 4, // 하단 40%
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  scrollList: {
    maxHeight: '70%',
  },
  wordItem: {
    fontSize: 16,
    paddingVertical: 6,
    borderBottomColor: '#ddd',
    borderBottomWidth: 1,
  },
  wordItemContainer: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomColor: '#e0e0e0',
    borderBottomWidth: 1,
  },
  wordText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  pronunciationText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  meaningText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center' },
  loadingText: { 
    fontSize: 16, 
    color: '#00BFFF', 
    textAlign: 'center',
    fontStyle: 'italic'
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  retakeButton: {
    backgroundColor: '#FF6347',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    flex: 0.4,
    alignItems: 'center',
  },
  completeButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    flex: 0.4,
    alignItems: 'center',
  },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});
