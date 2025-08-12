import AsyncStorage from '@react-native-async-storage/async-storage';

export const appAsyncStore = {
  googleId: null,
  email: null,
  name: null,
  accessToken: null,
  refreshToken: null,
  fcmToken: null,
};

// AsyncStorage에 appAsyncStore 데이터 저장
export const saveAppAsyncStorage = async () => {
  try {
    await AsyncStorage.setItem('appAsyncStore', JSON.stringify(appAsyncStore));
  } catch (error) {
    console.error("데이터 저장 오류:", error);
  }
};

// AsyncStorage에서 appAsyncStore 데이터 불러오기
export const loadAppAsyncStorage = async () => {
  try {
    const storedData = await AsyncStorage.getItem('appAsyncStore');
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      Object.assign(appAsyncStore, parsedData);
    }
  } catch (error) {
    console.error("데이터 불러오기 오류:", error);
  }
};

// 특정 키 값만 업데이트하고 AsyncStorage에 저장
export const updateAppAsyncStorage = async (key, value) => {
  if (appAsyncStore.hasOwnProperty(key)) {
    appAsyncStore[key] = value;
    try {
      await AsyncStorage.setItem('appAsyncStore', JSON.stringify(appAsyncStore));
    } catch (error) {
      console.error("데이터 업데이트 오류:", error);
    }
  } else {
    console.error(`'${key}'는 appAsyncStore에 존재하지 않는 키입니다.`);
  }
};

// appAsyncStore 초기화 및 AsyncStorage에서 삭제
export const clearAppAsyncStorage = async () => {
  try {
    Object.keys(appAsyncStore).forEach(key => appAsyncStore[key] = null);
    await AsyncStorage.removeItem('appAsyncStore');
  } catch (error) {
    console.error("데이터 초기화 오류:", error);
  }
};