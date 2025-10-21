// OCRCamera.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert, Dimensions, Linking, Image, ScrollView } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import type { Camera as CameraType } from 'react-native-vision-camera';
import { recognizeTextFromImage } from '../components/ocrHelper';
// import OCRBoundingOverlay from '../components/OCRBoundingOverlay';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const OCRCamera: React.FC = () => {
  const camera = useRef<CameraType>(null);
  const device = useCameraDevice('back'); // ✅ 더 안전한 방식

  const [hasPermission, setHasPermission] = useState(false);
  const [isPreview, setIsPreview] = useState(false); // ✅ 촬영 후 이미지 미리보기 모드
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState({ width: 0, height: 0 });
  const [words, setWords] = useState<any[]>([]);
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
          <View style={styles.captureButtonContainer}>
            <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
              <Text style={styles.buttonText}>촬영</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* ✅ 촬영 후 결과 화면 */
        <View style={styles.resultContainer}>
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
            <Text style={styles.listTitle}>📘 인식된 단어</Text>
            {words.length === 0 ? (
              <Text style={styles.emptyText}>인식된 단어가 없습니다.</Text>
            ) : (
              <ScrollView style={styles.scrollList}>
                {words.map((item, idx) => (
                  <Text key={idx} style={styles.wordItem}>
                    {item.text}
                  </Text>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
              <Text style={styles.buttonText}>다시 촬영</Text>
            </TouchableOpacity>
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
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center' },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  retakeButton: {
    backgroundColor: '#FF6347',
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});
