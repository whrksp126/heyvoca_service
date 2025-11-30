import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';

const screenHeight = Dimensions.get('window').height;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showHeader?: boolean;
  maxHeightRatio?: number; /** 0~1 사이 비율 (0.6 = 화면 높이의 60%) */
  scrollable?: boolean;
  backgroundColor?: string; /** 시트 배경색 */
}

/**
 * 공통 BottomSheet 컴포넌트
 */
const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  showHeader = true,
  maxHeightRatio = 0.5,
  scrollable = true,
  backgroundColor,
}) => {
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isClosing, setIsClosing] = useState(false);

  const sheetMaxHeight = screenHeight * maxHeightRatio;

  // 열릴 때 애니메이션
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  // 닫기 애니메이션
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsClosing(false);
        onClose();
      }
    });
  };

  // 완전히 닫힌 후 애니메이션 값 리셋
  useEffect(() => {
    if (!visible) {
      slideAnim.setValue(screenHeight);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  const ContentWrapper = scrollable ? ScrollView : View;
  const contentWrapperProps = scrollable
    ? {
        showsVerticalScrollIndicator: false,
        contentContainerStyle: [
          styles.contentContainer,
          !showHeader && styles.contentContainerNoHeader,
        ],
        keyboardShouldPersistTaps: 'handled' as const,
      }
    : { 
        style: [
          styles.contentContainer,
          { flex: 1 },
          !showHeader && styles.contentContainerNoHeader,
        ] 
      };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.wrapper}
      >
        {/* 바텀시트 본체 */}
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetMaxHeight,
              backgroundColor,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* 컨텐츠 */}
          <ContentWrapper {...contentWrapperProps}>{children}</ContentWrapper>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5e5',
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  contentContainerNoHeader: {
    paddingTop: 8,
  },
});

export default BottomSheet;
