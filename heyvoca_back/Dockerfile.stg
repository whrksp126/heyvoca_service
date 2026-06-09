FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Seoul

RUN apt-get update && \
    apt-get install -y python3-pip python3-dev tzdata default-mysql-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

ENV FLASK_APP=run.py
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
# gthread: TTS/Drive/FCM 등 블로킹 I/O 호출이 워커를 통째로 점유하지 않도록 스레드 동시성 확보.
# (sync 단일이면 cold-TTS 몇 건만 겹쳐도 전 워커 고갈) gevent는 monkeypatch 리스크로 미채택.
# 스케줄러는 socket lock(fcm.create_scheduler)으로 단일 프로세스만 실행 → 워커 증설해도 중복 푸시 없음.
CMD ["gunicorn", "-w", "4", "--threads", "4", "--worker-class", "gthread", "--timeout", "60", "-b", "0.0.0.0:5000", "run:app"]