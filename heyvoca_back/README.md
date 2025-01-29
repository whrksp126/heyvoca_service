### 📌 **프로젝트 README (Docker 기반 개발 및 배포 가이드)**
🚀 **이 문서는 프로젝트의 개발 및 배포 프로세스를 정리한 가이드입니다.**  
✅ **Git, Docker, CI/CD, 배포 단계까지 모두 포함**  
✅ **개발자가 쉽게 동일한 환경에서 개발하고, 테스트 및 배포할 수 있도록 구성됨**  

---

## **📂 1. 프로젝트 구조**
### **📌 Git 브랜치 구조**
```text
main       # 실제 서비스 운영 (배포용)
staging    # QA 테스트 환경 (실제 서비스 배포 전 검증)
dev        # 서버 개발 환경 (서버에서 개발 및 테스트)
local      # 개발자가 로컬에서 테스트하는 환경 (Docker 활용)
```
✅ **개발 및 배포 흐름:**  
1. **개발자는 로컬에서 개발 (`local`)**  
2. **개발이 완료되면 `dev`로 PR (서버 개발 환경 테스트)**  
3. **서버에서 테스트 후 `staging`으로 PR (QA 테스트 진행)**  
4. **QA 완료 후 `main`으로 PR (실제 배포 진행)**  

---

## **🛠 2. 개발 환경 세팅 방법 (로컬)**
### **1️⃣ Git 클론 후 환경 변수 세팅**
```sh
git clone https://github.com/whrksp126/heyvoca_back.git
git checkout local
.env.local  # 환경 변수 파일 관리자 문의
```

### **2️⃣ Docker Hub에서 이미지 다운로드**
✅ **도커 다운로드 필수!:**  
```sh
docker pull whrksp126/heyvoca_back:local
```

### **3️⃣ 로컬 개발 환경 실행 (`docker-compose.local.yml` 사용)**
```sh
docker-compose -f docker-compose.local.yml up -d
```
✅ 실행 완료 후 **http://localhost:5003** 에서 개발 환경 접속 가능  
✅ 코드 변경 시 **자동 반영됨** (`volumes` 설정 덕분)  

---

## **📝 3. 개발 & 테스트 방법**
### **📌 1️⃣ 실행 중인 컨테이너 확인**
```sh
docker ps
```

### **📌 2️⃣ 실시간 로그 확인**
```sh
docker logs -f heyvoca_back_local
```

### **📌 3️⃣ 컨테이너 내부 진입 (셸 실행)**
```sh
docker exec -it heyvoca_back_local sh
```

### **📌 4️⃣ 개발 테스트 완료 후 컨테이너 정리**
```sh
docker-compose -f docker-compose.local.yml down
```

---

## **🚀 4. `Docker Hub` 업데이트 방법**
**✅ 새로운 코드 반영 후 Docker Hub에 `local` 태그 업데이트**
```sh
docker build -t whrksp126/heyvoca_back:local .
docker push whrksp126/heyvoca_back:local
```
**✅ 다른 개발자가 변경된 이미지 적용**
```sh
docker pull whrksp126/heyvoca_back:local
docker-compose -f docker-compose.local.yml up -d
```

---

## **🚀 5. `GitHub` 및 `GitHub Actions` 적용 방법**
### **📌 1️⃣ `local` 브랜치에서 `dev`로 코드 푸쉬**
```sh
git checkout -b feature/your-feature
git add .
git commit -m "Add new feature"
git push origin feature/your-feature
```
✅ **GitHub에서 PR (Pull Request) 생성 후 `dev` 브랜치로 머지**  

---

## **🌍 6. 서버에 `dev` 브랜치 적용 (`GitHub Actions`)**
✅ **GitHub Actions가 `dev` 브랜치에 푸쉬될 때 자동 배포하도록 설정**  

📌 **`dev` 환경 적용 후 서버에서 확인**
```sh
ssh user@server
cd /var/www/your-project
git pull origin dev
docker-compose -f docker-compose.dev.yml up -d --build
```
✅ **http://dev.yourproject.com 에서 서버 개발 환경 확인 가능**  

---

## **🧪 7. QA (`staging`) 및 배포 (`main`) 프로세스**
### **📌 1️⃣ `dev`에서 `staging`으로 PR 후 QA 진행**
```sh
git checkout staging
git merge dev
git push origin staging
```
✅ GitHub Actions에서 `staging` 환경 자동 배포됨  
✅ `http://staging.yourproject.com` 에서 QA 진행  

### **📌 2️⃣ `staging`에서 `main`으로 PR 후 최종 배포**
```sh
git checkout main
git merge staging
git push origin main
```
✅ `GitHub Actions`가 `main`에 푸쉬 시 서버에 자동 배포  

---

## **🔥 최종 정리: 개발 ~ 배포 흐름**
| 단계 | 작업 내용 | 실행 명령어 |
|------|------|------|
| **1️⃣ 로컬 개발** | `docker-compose.local.yml` 실행 | `docker-compose -f docker-compose.local.yml up -d` |
| **2️⃣ 개발 완료** | `local` → `dev`로 PR | `git push origin feature/your-feature` |
| **3️⃣ 서버 개발 환경 적용** | `GitHub Actions` 통해 자동 배포 | `http://dev.yourproject.com` |
| **4️⃣ QA 테스트** | `staging` 브랜치로 PR 및 배포 | `http://staging.yourproject.com` |
| **5️⃣ 실제 배포** | `main` 브랜치로 머지 및 배포 | `http://yourproject.com` |

✅ **이제 개발자는 손쉽게 로컬 환경을 설정하고, 동일한 과정으로 배포할 수 있음!** 🚀🔥