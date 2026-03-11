import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  useIAP, 
  initConnection, 
  purchaseUpdatedListener, 
  purchaseErrorListener,
  getAvailablePurchases,
  finishTransaction,
  type ProductPurchase,
  type PurchaseError
} from 'react-native-iap';

// App Store Connect 및 Google Play Console에 등록된 상품 ID
const itemSkus = ['com.heyvoca.gems_4', 'com.heyvoca.gems_10'];

interface IapScreenProps {
  onClose: () => void;
}

const IapScreen = ({ onClose }: IapScreenProps) => {
  const [gems, setGems] = useState(0);
  const [logs, setLogs] = useState<Array<{ id: number; message: string; type: 'info' | 'success' | 'error'; timestamp: string }>>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // useIAP 훅 사용 (v14+)
  const {
    connected,
    products,
    fetchProducts,
    requestPurchase,
  } = useIAP();

  // 로그 추가 함수
  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = { id: Date.now(), message, type, timestamp };
    setLogs(prev => [newLog, ...prev].slice(0, 20)); // 최대 20개 로그만 유지
  };

  // 상품 ID에 따른 보석 개수 반환
  const getGemAmount = (sku: string) => {
    switch (sku) {
      case 'com.heyvoca.gems_4': return 4;
      case 'com.heyvoca.gems_10': return 10;
      default: return 0;
    }
  };

  // 인앱 구매 초기화 및 이벤트 리스너 설정
  useEffect(() => {
    let purchaseUpdateSubscription: any = null;
    let purchaseErrorSubscription: any = null;

    const initIap = async () => {
      try {
        addLog('인앱 결제 초기화 중...', 'info');
        
        // IAP 연결 초기화
        await initConnection();
        addLog('인앱 결제 연결 성공!', 'success');
        
        // 구매 업데이트 리스너 설정
        purchaseUpdateSubscription = purchaseUpdatedListener(
          (purchase: ProductPurchase) => {
            addLog(`구매 업데이트: ${purchase.productId}`, 'info');
            handlePurchaseUpdate(purchase);
          }
        );

        // 구매 에러 리스너 설정
        purchaseErrorSubscription = purchaseErrorListener(
          (error: PurchaseError) => {
            addLog(`구매 에러: ${error.message}`, 'error');
            handlePurchaseError(error);
          }
        );

        setIsInitialized(true);
        
        // 상품 목록 가져오기
        await fetchProducts({ skus: itemSkus, type: 'in-app' });
        addLog(`상품 로드 성공: ${products.length}개`, 'success');
        
      } catch (error: any) {
        console.error('IAP 초기화 에러:', error);
        addLog(`IAP 초기화 실패: ${error.message}`, 'error');
        Alert.alert('IAP 초기화 실패', '인앱 결제를 초기화할 수 없습니다. 앱을 다시 시작해주세요.');
      }
    };
    
    initIap();

    // 정리 함수
    return () => {
      if (purchaseUpdateSubscription) {
        purchaseUpdateSubscription.remove();
      }
      if (purchaseErrorSubscription) {
        purchaseErrorSubscription.remove();
      }
    };
  }, []);

  // 구매 업데이트 처리 (이벤트 기반)
  const handlePurchaseUpdate = async (purchase: ProductPurchase) => {
    try {
      addLog(`구매 완료: ${purchase.productId}`, 'success');
      console.log('Purchase details:', {
        productId: purchase.productId,
        quantity: purchase.quantity,
        transactionDate: purchase.transactionDate,
        purchaseToken: purchase.purchaseToken,
      });

      // 보석 개수 증가 (실제 구매 수량 반영)
      const gemAmount = getGemAmount(purchase.productId);
      const actualQuantity = purchase.quantity || 1;
      const totalGems = gemAmount * actualQuantity;
      
      setGems(prev => prev + totalGems);
      addLog(`보석 ${totalGems}개 획득! (${gemAmount}개 × ${actualQuantity}개)`, 'success');
      
      // 영수증 저장
      const receipt = Platform.OS === 'ios' ? purchase.transactionReceipt : purchase.purchaseToken;
      if (receipt) {
        await AsyncStorage.setItem('receipt', receipt);
        addLog('영수증 저장 완료', 'success');
      }

      // 구매 완료 처리 (소모품)
      await finishTransaction({
        purchase: purchase,
        isConsumable: true,
      });
      addLog('구매 완료 처리 성공', 'success');
      
      Alert.alert('구매 성공!', `보석 ${totalGems}개를 획득했습니다! (${gemAmount}개 × ${actualQuantity}개)`);
      
    } catch (error: any) {
      console.error('구매 완료 처리 실패:', error);
      addLog(`구매 완료 처리 실패: ${error.message}`, 'error');
      Alert.alert('구매 완료 처리 실패', `구매 완료 처리 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  // 구매 에러 처리
  const handlePurchaseError = (error: PurchaseError) => {
    console.error('구매 에러:', error);
    addLog(`구매 에러: ${error.message}`, 'error');
    
    switch (error.code) {
      case 'E_USER_CANCELLED':
        addLog('사용자가 구매를 취소했습니다', 'info');
        break;
      case 'E_ITEM_UNAVAILABLE':
        Alert.alert('상품 사용 불가', '이 상품은 현재 구매할 수 없습니다');
        break;
      case 'E_NETWORK_ERROR':
        Alert.alert('네트워크 오류', '네트워크 연결을 확인해주세요');
        break;
      default:
        Alert.alert('구매 실패', `구매 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  // 구매 요청
  const handlePurchase = async (productId: string) => {
    try {
      addLog(`구매 시도: ${productId}`, 'info');
      
      // v14+ 새로운 플랫폼별 API 사용
      await requestPurchase({
        request: {
          ios: {
            sku: productId,
          },
          android: {
            skus: [productId],
          },
        },
      });
      
    } catch (error: any) {
      console.error('구매 실패:', error);
      addLog(`구매 실패: ${error.message}`, 'error');
      
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert('구매 실패', `구매 중 오류가 발생했습니다: ${error.message}`);
      }
    }
  };

  // 구매 내역 확인 (v14+ API 사용)
  const restorePurchases = async () => {
    try {
      addLog('구매 내역 확인 중...', 'info');
      
      // v14+에서는 getAvailablePurchases 사용
      const availablePurchases = await getAvailablePurchases();
      addLog(`활성화된 구매: ${availablePurchases.length}개`, 'success');
      console.log('Available purchases:', availablePurchases);
      
      // 구매 내역 상세 분석
      const purchaseSummary = availablePurchases.reduce((acc, purchase) => {
        const productId = purchase.productId;
        const quantity = purchase.quantity || 1;
        
        if (!acc[productId]) {
          acc[productId] = { count: 0, totalQuantity: 0, totalGems: 0 };
        }
        
        acc[productId].count += 1;
        acc[productId].totalQuantity += quantity;
        acc[productId].totalGems += getGemAmount(productId) * quantity;
        
        return acc;
      }, {} as Record<string, { count: number; totalQuantity: number; totalGems: number }>);
      
      console.log('Purchase summary:', purchaseSummary);
      addLog(`구매 요약: ${JSON.stringify(purchaseSummary)}`, 'info');
      
      // 구매 내역 상세 정보 표시
      let historyText = `활성화된 구매: ${availablePurchases.length}개\n\n`;
      
      if (availablePurchases.length > 0) {
        // 구매 요약 표시
        historyText += '구매 요약:\n';
        Object.entries(purchaseSummary).forEach(([productId, summary]) => {
          historyText += `• ${productId}: ${summary.count}회 구매, 총 ${summary.totalQuantity}개, ${summary.totalGems}개 보석\n`;
        });
        historyText += '\n';
        
        // 상세 구매 내역 표시
        historyText += '상세 구매 내역:\n';
        availablePurchases.forEach((purchase, index) => {
          const date = new Date(purchase.transactionDate).toLocaleString();
          const quantity = purchase.quantity || 1;
          const gemAmount = getGemAmount(purchase.productId);
          const totalGems = gemAmount * quantity;
          historyText += `${index + 1}. ${purchase.productId} (${quantity}개) - ${totalGems}개 보석 - ${date}\n`;
        });
        historyText += '\n';
      } else {
        historyText += '활성화된 구매가 없습니다.\n\n';
        historyText += '소모품은 구매 후 즉시 소비되므로 활성화된 구매 목록에 표시되지 않습니다.\n\n';
      }
      
      historyText += '보석은 소모품이므로 계속 구매할 수 있습니다!';
      
      Alert.alert('구매 내역 확인 완료', historyText);
      
    } catch (error: any) {
      console.error('구매 내역 확인 실패:', error);
      addLog(`구매 내역 확인 실패: ${error.message}`, 'error');
      Alert.alert('구매 내역 확인 실패', `구매 내역을 확인할 수 없습니다: ${error.message}`);
    }
  };

  return (
    <View style={styles.iapContainer}>
      <Text style={styles.title}>💎 인앱 결제 테스트</Text>
      
      {/* 연결 상태 표시 */}
      <View style={[styles.statusContainer, isInitialized ? styles.statusSuccess : styles.statusError]}>
        <Text style={styles.statusText}>상태: {isInitialized ? '연결됨' : '연결 중...'}</Text>
      </View>

      {/* 보석 개수 표시 */}
      <View style={styles.gemDisplay}>
        <Text style={styles.gemText}>보석: {gems}개</Text>
      </View>

      {/* 상품 구매 버튼 */}
      <View style={styles.productsContainer}>
        <Text style={styles.productsTitle}>보석 구매:</Text>
        {products.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={[styles.productButton, !isInitialized && styles.productButtonDisabled]}
            onPress={() => handlePurchase(product.id)}
            disabled={!isInitialized}
          >
            <Text style={styles.productButtonText}>
              {product.title} - {product.displayPrice}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 설명 */}
      <View style={styles.descriptionContainer}>
        <Text style={styles.description}>
          💎 보석을 구매하여 앱 개발을 지원해주세요!
        </Text>
        <Text style={styles.description}>
          🔄 구매 내역을 확인하거나 보석을 계속 구매하세요
        </Text>
        <Text style={styles.description}>
          ⚠️ 테스트 환경에서는 실제 결제가 발생하지 않습니다
        </Text>
      </View>

      {/* 로그 표시 */}
      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>실시간 로그:</Text>
        <ScrollView style={styles.logsList}>
          {logs.map((log) => (
            <View key={log.id} style={[styles.logItem, styles[`logItem${log.type.charAt(0).toUpperCase() + log.type.slice(1)}`]]}>
              <Text style={styles.logTime}>{log.timestamp}</Text>
              <Text style={styles.logMessage}>{log.message}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 컨트롤 버튼들 */}
      <View style={styles.controlButtons}>
        <TouchableOpacity 
          style={styles.refreshButton} 
          onPress={() => fetchProducts({ skus: itemSkus, type: 'in-app' })}
          disabled={!isInitialized}
        >
          <Text style={styles.refreshButtonText}>상품 새로고침</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.restoreButton} 
          onPress={restorePurchases}
          disabled={!isInitialized}
        >
          <Text style={styles.restoreButtonText}>구매 내역 확인</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={onClose}
        >
          <Text style={styles.closeButtonText}>← WebView</Text>
        </TouchableOpacity>
      </View>

      {!isInitialized && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>인앱 결제 연결 중...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  iapContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#333',
  },
  statusContainer: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  statusSuccess: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
  },
  statusError: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  gemDisplay: {
    backgroundColor: '#FFD700',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  gemText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  productsContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  productsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  productButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  productButtonDisabled: {
    backgroundColor: '#ccc',
  },
  productButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  descriptionContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  logsContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    flex: 1,
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  logsList: {
    flex: 1,
  },
  logItem: {
    padding: 8,
    marginBottom: 5,
    borderRadius: 5,
    borderLeftWidth: 3,
  },
  logItemInfo: {
    backgroundColor: '#e3f2fd',
    borderLeftColor: '#2196f3',
  },
  logItemSuccess: {
    backgroundColor: '#e8f5e8',
    borderLeftColor: '#4caf50',
  },
  logItemError: {
    backgroundColor: '#ffebee',
    borderLeftColor: '#f44336',
  },
  logTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  logMessage: {
    fontSize: 14,
    color: '#333',
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    flex: 0.3,
  },
  refreshButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
  },
  restoreButton: {
    backgroundColor: '#28a745',
    padding: 10,
    borderRadius: 8,
    flex: 0.3,
  },
  restoreButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
  },
  closeButton: {
    backgroundColor: '#6c757d',
    padding: 10,
    borderRadius: 8,
    flex: 0.3,
  },
  closeButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
});

export default IapScreen;