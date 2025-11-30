// OCRCamera.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert, Dimensions, Linking, Image, ScrollView } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import type { Camera as CameraType } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recognizeTextFromImage } from '../components/ocrHelper';
import { useNavigation } from '../contexts/NavigationContext';
import BottomSheet from '../components/BottomSheet';
import { IconCamera } from '../assets/SvgIcon';
// import OCRBoundingOverlay from '../components/OCRBoundingOverlay';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const OCRCamera: React.FC = () => {
  const camera = useRef<CameraType>(null);
  const device = useCameraDevice('back'); // ✅ 더 안전한 방식
  const { goBack, webViewRef, setIsOCRScreen, ocrFilteredWords, setOcrFilteredWords } = useNavigation();
  const insets = useSafeAreaInsets();

  const [hasPermission, setHasPermission] = useState(false);
  const [isPreview, setIsPreview] = useState(false); // ✅ 촬영 후 이미지 미리보기 모드
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const [words, setWords] = useState<any[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);
  const [selectedWord, setSelectedWord] = useState<any | null>(null);
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
    setSelectedWord(null);
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
    setSelectedWord(null);
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
          {/* 촬영 버튼 */}
          <View style={styles.captureButtonContainer}>
            <TouchableOpacity onPress={takePhoto}>
              <IconCamera width="70" height="70" />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* ✅ 촬영 후 결과 화면 */
        <View style={styles.previewContainer}>
          {/* 헤더 */}
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <TouchableOpacity
              style={styles.headerBackButton}
              onPress={closeOCRScreen}
            >
              <Text style={styles.headerBackIcon}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>단어 선택</Text>
            <View style={styles.headerRightPlaceholder} />
          </View>

          {/* 카메라 결과 이미지 */}
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          )}

          {/* 여기서부터 커스텀 바텀시트 사용 */}
          <BottomSheet
            visible={isPreview}
            onClose={closeOCRScreen}
            title="단어 선택"
            maxHeightRatio={selectedWord ? 0.25 : 0.47}
            backgroundColor="#FFFFFF"
            showHeader={false}
            scrollable={false}
          >
            {/* 여기 안에 단어 리스트 + 버튼들 넣기 */}
            {isFiltering ? (
              <Text style={{ textAlign: 'center', color: '#FF87B0' }}>
                단어 정제 중입니다...
              </Text>
            ) : (
              <View style={styles.bottomSheetContent}>
                {/* 선택된 단어가 있으면 해당 단어만, 없으면 전체 리스트 */}
                {selectedWord ? (
                  // 선택된 단어 상세 화면
                  <View style={styles.selectedWordContainer}>
                    <View style={styles.selectedWordItemContainer}>
                      <Text style={styles.wordText}>{selectedWord.word || '(단어 없음)'}</Text>
                      <Text style={styles.meaningText}>
                        {selectedWord.meanings && Array.isArray(selectedWord.meanings) && selectedWord.meanings.length > 0
                          ? selectedWord.meanings
                              .map((m: any) => typeof m === 'string' ? m : m.meaning || m.text || JSON.stringify(m))
                              .join(', ')
                          : '-'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  // 전체 단어 리스트
                  <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
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
                        <TouchableOpacity 
                          key={item.id || idx} 
                          style={styles.wordItemContainer}
                          onPress={() => setSelectedWord(item)}
                        >
                          <Text style={styles.wordText}>{item.word || '(단어 없음)'}</Text>
                          <Text style={styles.meaningText} numberOfLines={2}>
                            {getMeaningsText() || '-'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                {/* 하단 버튼 - 선택 여부에 따라 다르게 표시 */}
                <View style={styles.buttonRow}>
                  {selectedWord ? (
                    <>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.reselectButton]} 
                        onPress={() => setSelectedWord(null)}
                      >
                        <Text style={styles.buttonText}>다시 선택</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.addButton]} 
                        onPress={() => {
                          // TODO: 단어 추가 로직
                          console.log('단어 추가:', selectedWord);
                        }}
                      >
                        <Text style={styles.buttonText}>추가</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
                      <Text style={styles.buttonText}>재촬영</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </BottomSheet>
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
  captureButtonContainer: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
  },
  bottomSheetContent: {
    flex: 1,
    flexDirection: 'column',
  },
  scrollList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 15,
    marginBottom: 20,
    backgroundColor: '#FFEFFA',
    borderRadius: 10,
  },
  selectedWordContainer: {
    flex: 1,
    paddingHorizontal: 20,
    marginVertical: 20,
    justifyContent: 'center',
    backgroundColor: '#FFEFFA',
    borderRadius: 10,
  },
  selectedWordItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 5,
  },
  wordItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 5,
    borderBottomColor: '#DDDDDD',
    borderBottomWidth: 1,
  },
  wordText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  meaningText: {
    fontSize: 13,
    fontWeight: 'regular',
    color: '#111111',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    height: 80,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 5,
  },
  headerBackButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackIcon: {
    fontSize: 22,
    color: '#111111',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  headerRightPlaceholder: {
    width: 44,
    height: 44,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 20,
  },
  retakeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CCCCCC',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  reselectButton: {
    backgroundColor: '#CCCCCC',
  },
  addButton: {
    backgroundColor: '#FF8DD4',
  },
  buttonText: { 
    color: '#ffffff', 
    fontSize: 16, 
    fontWeight: '600' 
  },
});
