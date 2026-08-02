import { useEffect, useRef } from "react";
import { backendUrl, fetchDataAsync } from '../utils/common';
import { useNewBottomSheetActions } from './NewBottomSheetContext';
import { UpdateNewBottomSheet } from '../components/newBottomSheet/UpdateNewBottomSheet';
import { startBuildVersionWatch } from '../utils/buildVersion';

// 백엔드 version 조회 API 주소
const CHECK_VERSION_URL = `${backendUrl}/version/get_version`;

// semver "a.b.c" 비교 — a<b: -1, a==b: 0, a>b: 1
function compareVersions(a, b) {
  const pa = String(a || "0").split(".").map(n => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

// userAgent에서 "HeyVoca iOS/1.0.0" 패턴 파싱
function parseAppUserAgent() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const m = ua.match(/HeyVoca (iOS|Android)\/([\d.]+)/);
  if (!m) return null;
  return { platform: m[1], version: m[2] };
}

async function fetchVersionInfo() {
  const result = await fetchDataAsync(CHECK_VERSION_URL, 'GET', {}, false, null);
  if (result.code !== 200) {
    console.error("웹 버전 체크 실패:", result.message);
    return null;
  }
  return result.data;
}

// ✅ LocalStorage 마이그레이션
function checkAndMigrateLocalStorage(latestVersion) {
  let storedVersion = localStorage.getItem("localStorage_version") || "1.0.0";
  if (storedVersion === latestVersion) return;

  let data = JSON.parse(localStorage.getItem("app_data") || "{}");

  if (compareVersions(storedVersion, "1.0.1") < 0) {
    if (data.old_format) {
      data.new_format = data.old_format;
      delete data.old_format;
    }
    data.updated_setting = true;
  }

  localStorage.setItem("app_data", JSON.stringify(data));
  localStorage.setItem("localStorage_version", latestVersion);
}

// ✅ SessionStorage 마이그레이션
function checkAndMigrateSessionStorage(latestVersion) {
  let storedVersion = sessionStorage.getItem("sessionStorage_version") || "1.0.0";
  if (storedVersion === latestVersion) return;

  let sessionData = JSON.parse(sessionStorage.getItem("session_data") || "{}");

  if (compareVersions(storedVersion, "1.0.1") < 0) {
    if (sessionData.temp_key) {
      sessionData.new_temp_key = sessionData.temp_key + "_updated";
      delete sessionData.temp_key;
    }
  }

  sessionStorage.setItem("session_data", JSON.stringify(sessionData));
  sessionStorage.setItem("sessionStorage_version", latestVersion);
}

// ✅ IndexedDB 마이그레이션
function checkAndMigrateIndexedDB(latestVersion) {
  const storedVersion = localStorage.getItem("indexedDB_version") || "1.0.0";
  if (storedVersion === latestVersion) return;

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
    }
    if (event.oldVersion < 3) {
      let store = event.currentTarget.transaction.objectStore("vocabularies");
      store.createIndex("difficulty", "difficulty", { unique: false });
    }
  };

  request.onsuccess = function () {
    localStorage.setItem("indexedDB_version", latestVersion);
  };
}

export default function WebStorageMigration() {
  const checkingRef = useRef(false);
  const { openAwaitNewBottomSheet } = useNewBottomSheetActions();

  useEffect(() => {
    const check = async () => {
      // 이미 체크/모달 진행 중이면 중복 호출 방지
      // (await 중인 경우 finally까지 안 가므로 visibilitychange 재진입에도 안전)
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const data = await fetchVersionInfo();
        if (!data) return;

        // 1) 웹 버전 — 신버전 배포 감지 시 reload (캐시된 index.html 우회)
        const latestWebVersion = data.web_version;
        const currentWebVersion = localStorage.getItem("web_version") || "1.0.0";
        if (compareVersions(currentWebVersion, latestWebVersion) < 0) {
          localStorage.setItem("web_version", latestWebVersion);
          window.location.reload();
          return;
        }

        // 2) 앱 버전 — userAgent로 받은 현재 앱 버전과 비교 (앱 환경에서만)
        const appUa = parseAppUserAgent();
        if (appUa) {
          const required = appUa.platform === 'iOS'
            ? data.app_ios_version
            : data.app_android_version;
          const min = data.min_app_version;
          const storeUrl = appUa.platform === 'iOS'
            ? data?.store_url?.ios
            : data?.store_url?.android;

          if (min && compareVersions(appUa.version, min) < 0) {
            // 강제 업데이트: 닫기 불가
            await openAwaitNewBottomSheet(
              UpdateNewBottomSheet,
              { mode: 'force', platform: appUa.platform, storeUrl },
              {
                isBackdropClickClosable: false,
                isDragToCloseEnabled: false,
              }
            );
          } else if (required && compareVersions(appUa.version, required) < 0) {
            // 권장 업데이트: 같은 required 버전에 대해 dismiss 기록이 있으면 다시 노출하지 않음
            const dismissedFor = localStorage.getItem("update_dismissed_for");
            if (dismissedFor !== required) {
              await openAwaitNewBottomSheet(
                UpdateNewBottomSheet,
                { mode: 'recommended', platform: appUa.platform, storeUrl },
                {
                  isBackdropClickClosable: true,
                  backdropClickValue: false,
                  isDragToCloseEnabled: false,
                }
              );
              // 어떤 선택을 했든(업데이트 클릭/나중에/backdrop) 같은 버전엔 다시 띄우지 않음
              // → "지금 업데이트" 후 스토어 다녀와도 모달 재노출 방지
              localStorage.setItem("update_dismissed_for", required);
            }
          }
        }

        // 3) 저장소 마이그레이션
        checkAndMigrateLocalStorage(data.web_storage_versions.localStorage);
        checkAndMigrateSessionStorage(data.web_storage_versions.sessionStorage);
        checkAndMigrateIndexedDB(data.web_storage_versions.indexedDB);
      } catch (error) {
        console.error("스토리지 버전 확인 실패:", error);
      } finally {
        checkingRef.current = false;
      }
    };

    check();

    // 프론트 배포 감지는 백엔드 web_version(수기)이 아니라 **빌드 지문**(/version.json)이 담당한다.
    //  수기 bump 를 잊어도 열려 있던 탭이 스스로 낡음을 알고 안전한 순간에 갱신한다.
    const stopBuildWatch = startBuildVersionWatch();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stopBuildWatch();
    };
  }, [openAwaitNewBottomSheet]);

  return null;
}
