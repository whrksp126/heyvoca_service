import AsyncStorage from '@react-native-async-storage/async-storage';

export const appAsyncStore = {
  idToken: null,
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

// 쿠키 저장 (cookie_{name} 형태로 저장)
export const saveCookieToAsyncStorage = async (name, value, expires) => {
  try {
    const cookieData = {
      value: value,
      expires: expires,
      timestamp: new Date().toISOString()
    };
    
    await AsyncStorage.setItem(`cookie_${name}`, JSON.stringify(cookieData));
    console.log(`쿠키 저장됨: ${name}`, cookieData);
  } catch (error) {
    console.error("쿠키 저장 오류:", error);
  }
};

// 쿠키 조회 (cookie_{name} 형태로 조회, 만료일 확인)
export const getCookieFromAsyncStorage = async (name) => {
  try {
    const cookieDataStr = await AsyncStorage.getItem(`cookie_${name}`);
    if (!cookieDataStr) {
      console.log(`쿠키 없음: ${name}`);
      return null;
    }
    
    const cookieData = JSON.parse(cookieDataStr);
    const expiresDate = new Date(cookieData.expires);
    const now = new Date();
    
    // 만료 확인
    if (now > expiresDate) {
      console.log(`쿠키 만료됨: ${name}`);
      await AsyncStorage.removeItem(`cookie_${name}`);
      return null;
    }
    
    console.log(`쿠키 조회됨: ${name}`, cookieData.value);
    return cookieData.value;
  } catch (error) {
    console.error("쿠키 가져오기 오류:", error);
    return null;
  }
};