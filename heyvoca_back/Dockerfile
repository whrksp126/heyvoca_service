# 베이스 이미지로 우분투 사용
FROM ubuntu:20.04

# 필수 패키지 설치 및 시간대 설정
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y python3-pip python3-dev nginx tzdata && \
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

# CMD 명령: Flask 앱 실행
CMD ["gunicorn", "-w", "3", "-b", "0.0.0.0:5003", "app:app"]

# CMD ["sh", "-c", "flask run --host=0.0.0.0 --port=$FLASK_RUN_PORT"]