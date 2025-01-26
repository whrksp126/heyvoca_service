# 베이스 이미지로 우분투 사용
FROM ubuntu:20.04

# 필수 패키지 설치 및 시간대 설정
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y python3-pip python3-dev nginx tzdata tesseract-ocr && \
    ln -fs /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    dpkg-reconfigure --frontend noninteractive tzdata && \
    apt-get clean

# 작업 디렉토리 설정
WORKDIR /app

# requirements.txt 복사 및 패키지 설치
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Flask 애플리케이션 복사
COPY app.py .

# # 환경 변수를 설정하여 로그를 강제로 STDOUT으로 보냄
# ENV PYTHONUNBUFFERED=1

# 로컬 개발용 Flask 실행
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"] 
# # 
# CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"] 
# # 프로덕션 서버용 Flask 실행
# CMD ["gunicorn", "-b", "unix:/var/www/vocaandgo/vocaandgo.sock", "app:app"] 