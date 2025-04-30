import { useEffect } from "react";
import { backendUrl, fetchDataAsync } from '../utils/common';

// 백엔드 version 조회 API 주소
const CHECK_VERSION_URL = `${backendUrl}/version/get_version`;

async function checkAndMigrateStorage() {
  try {
    const url = `${CHECK_VERSION_URL}`;
    const method = 'GET';
    const fetchData = {};
    const result = await fetchDataAsync(url, method, fetchData);
    if(result.code != 200){
      console.error("웹 버전 체크 실패:", result.message);
      return;
    }
    const data = result.data;
    const latestWebVersion = data.web_version;
    const latestLocalStorageVersion = data.web_storage_versions.localStorage;
    const latestSessionStorageVersion = data.web_storage_versions.sessionStorage;
    const latestIndexedDBVersion = data.web_storage_versions.indexedDB;

    // ✅ 웹 버전 체크 (필요하면 강제 새로고침)
    const currentWebVersion = localStorage.getItem("web_version") || "1.0.0";
    if (currentWebVersion < latestWebVersion) {
      console.log("웹 버전 업데이트 필요! 페이지를 새로고침합니다.");
      localStorage.setItem("web_version", latestWebVersion);
      window.location.reload();
      return;
    }

    // ✅ 저장소 개별 버전 체크 및 마이그레이션
    checkAndMigrateLocalStorage(latestLocalStorageVersion);
    checkAndMigrateSessionStorage(latestSessionStorageVersion);
    checkAndMigrateIndexedDB(latestIndexedDBVersion);

  } catch (error) {
    console.error("스토리지 버전 확인 실패:", error);
  }
}

// ✅ LocalStorage 마이그레이션
function checkAndMigrateLocalStorage(latestVersion) {
  let storedVersion = localStorage.getItem("localStorage_version") || "1.0.0";

  if (storedVersion === latestVersion) {
    console.log("✅ LocalStorage 데이터가 최신입니다.");
    return;
  }

  console.log(`🔄 LocalStorage 데이터 마이그레이션: ${storedVersion} → ${latestVersion}`);

  let data = JSON.parse(localStorage.getItem("app_data") || "{}");

  // 🔹 "1.0.0" → "1.0.1" 마이그레이션 예시
  if (storedVersion < "1.0.1") {
    if (data.old_format) {
      data.new_format = data.old_format;  // 새 구조로 변환
      delete data.old_format;
    }

    // 예제: 기존 설정 값을 업데이트하는 경우
    data.updated_setting = true;
  }

  // ✅ 변경된 데이터 저장
  localStorage.setItem("app_data", JSON.stringify(data));
  localStorage.setItem("localStorage_version", latestVersion);

  console.log("✅ LocalStorage 마이그레이션 완료!");
}

// ✅ SessionStorage 마이그레이션
function checkAndMigrateSessionStorage(latestVersion) {
  let storedVersion = sessionStorage.getItem("sessionStorage_version") || "1.0.0";

  if (storedVersion === latestVersion) {
    console.log("✅ SessionStorage 데이터가 최신입니다.");
    return;
  }

  console.log(`🔄 SessionStorage 데이터 마이그레이션: ${storedVersion} → ${latestVersion}`);

  let sessionData = JSON.parse(sessionStorage.getItem("session_data") || "{}");

  // 🔹 "1.0.0" → "1.0.1" 마이그레이션 예시
  if (storedVersion < "1.0.1") {
    if (sessionData.temp_key) {
      sessionData.new_temp_key = sessionData.temp_key + "_updated"; // 예제: 새로운 형식으로 변경
      delete sessionData.temp_key;
    }
  }

  sessionStorage.setItem("session_data", JSON.stringify(sessionData));
  sessionStorage.setItem("sessionStorage_version", latestVersion);

  console.log("✅ SessionStorage 마이그레이션 완료!");
}

// ✅ IndexedDB 마이그레이션
function checkAndMigrateIndexedDB(latestVersion) {
  const storedVersion = localStorage.getItem("indexedDB_version") || "1.0.0";

  if (storedVersion === latestVersion) {
    console.log("✅ IndexedDB 데이터가 최신입니다.");
    return;
  }

  console.log(`🔄 IndexedDB 데이터 마이그레이션: ${storedVersion} → ${latestVersion}`);

  const request = indexedDB.open("heyvocaDB", Number(latestVersion));

  request.onupgradeneeded = function (event) {
    const db = event.target.result;

    if (event.oldVersion < 1) {
      let store = db.createObjectStore("vocabularies", { keyPath: "id", autoIncrement: true });
      store.createIndex("word", "word", { unique: false });
    }

    if (event.oldVersion < 2) {
      let store = event.currentTarget.transaction.objectStore("vocabularies");
      store.createIndex("category", "category", { unique: false });
      console.log("✅ IndexedDB 마이그레이션 완료 (category 필드 추가)");
    }

    // 🔹 "1.0.0" → "1.0.1" 마이그레이션 예시
    if (event.oldVersion < 3) {
      let store = event.currentTarget.transaction.objectStore("vocabularies");
      store.createIndex("difficulty", "difficulty", { unique: false }); // 새 인덱스 추가
      console.log("✅ IndexedDB 마이그레이션 완료 (difficulty 필드 추가)");
    }
  };

  request.onsuccess = function () {
    console.log("✅ IndexedDB 마이그레이션 완료!");
    localStorage.setItem("indexedDB_version", latestVersion);
  };
}

// ✅ React 컴포넌트 (앱 실행 시 최초 1회 실행)
export default function WebStorageMigration() {
  useEffect(() => {
    checkAndMigrateStorage();
  }, []);

  return null; // UI에 표시할 내용 없음
}
