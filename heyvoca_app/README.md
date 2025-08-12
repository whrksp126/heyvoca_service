

## iOS 환경에서 새로운 네이티브 패키지 추가 시 세팅 방법

1. CocoaPods 설치 (최초 1회만 필요, 이미 설치되어 있다면 생략)
sudo gem install cocoapods

2. iOS 디렉토리로 이동
cd ios

3. Pod install 실행
pod install

4. 프로젝트 루트로 이동
cd ..


## 🟢 Android에서 커스텀 .env 파일(.env.dev 등) 적용 방법

Android에서 .env.dev 등 커스텀 환경변수 파일을 사용하려면
android/app/build.gradle 파일 상단에 아래 코드를 반드시 추가해야 합니다.

// react-native-config 수동 추가
apply from: project(':react-native-config').projectDir.getPath() + "/dotenv.gradle"


## 🍏 iOS Google 로그인 연동을 위한 Info.plist 설정 방법

Google 로그인을 위해서는 **iOS URL 스키마**를 반드시 Info.plist에 등록해야 합니다.

### 1. iOS URL 스키마 확인 방법

- 구글 클라우드 콘솔에서 iOS용 OAuth 클라이언트 생성 시,  "iOS URL 스키마" 항목을 복사합니다. 
- 또는 `GoogleService-Info.plist` 파일의 `REVERSED_CLIENT_ID` 값과 동일합니다.

### 2. Info.plist에 등록 방법
`ios/heyvoca/Info.plist` 파일에 아래와 같이 추가하세요.

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.584113926081-no8unvtm9s5lbli7se02m54pakac320l</string>
    </array>
  </dict>
</array>
```

## 🔑 Android SHA-1 확인 방법

### 1. Debug 키스토어 SHA-1 확인

```sh
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android
keytool -list -v -keystore [릴리즈키경로] -alias [별칭] -storepass [스토어패스] -keypass [키패스]

```