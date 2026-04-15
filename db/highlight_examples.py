#!/usr/bin/env python3
"""
사전 예문 단어 강조 처리 스크립트
voca_example.exam_en 에서 해당 단어(및 변형형)를
<strong class="target-word">단어</strong> 태그로 감싼다.

사용법:
    # 컨테이너 내부에서 실행 (docker exec)
    python3 /tmp/highlight_examples.py docker_local           # 로컬 Docker 컨테이너
    python3 /tmp/highlight_examples.py docker_local --dry-run # 변경 내용만 출력

    # 호스트에서 직접 실행
    python db/highlight_examples.py local           # 로컬 DB (127.0.0.1:3310)
    python db/highlight_examples.py dev             # dev 서버 (SSH 터널 자동)
    python db/highlight_examples.py stg
    python db/highlight_examples.py prod
    python db/highlight_examples.py local --dry-run
"""

import sys
import re
import json
import subprocess
import time
import signal
import atexit

try:
    import pymysql
except ImportError:
    print("pymysql 설치 필요: pip install pymysql")
    sys.exit(1)

# ── 환경별 DB 설정 ──────────────────────────────────────────────────────────

CONFIGS = {
    # 컨테이너 내부에서 실행 시 (docker exec heyvoca_back_local python3 ...)
    "docker_local": {
        "host": "mysql",
        "port": 3306,
        "user": "voca",
        "password": "voca!@34",
        "database": "heyvoca",
        "ssh_tunnel": None,
    },
    # 호스트에서 직접 실행 시
    "local": {
        "host": "127.0.0.1",
        "port": 3310,
        "user": "voca",
        "password": "voca!@34",
        "database": "heyvoca",
        "ssh_tunnel": None,
    },
    "dev": {
        "host": "127.0.0.1",
        "port": 13310,
        "user": "voca",
        "password": "voca!@34",
        "database": "heyvoca",
        "ssh_tunnel": {
            "ssh_host": "ghmate.iptime.org",
            "ssh_port": 222,
            "ssh_user": "ghmate",
            "ssh_key": "~/.ssh/ghmate_server",
            "remote_host": "heyvoca_mysql_dev",
            "remote_port": 3306,
            "local_port": 13310,
        },
    },
    "stg": {
        "host": "127.0.0.1",
        "port": 13311,
        "user": "voca",
        "password": "voca!@34",
        "database": "heyvoca",
        "ssh_tunnel": {
            "ssh_host": "ghmate.iptime.org",
            "ssh_port": 222,
            "ssh_user": "ghmate",
            "ssh_key": "~/.ssh/ghmate_server",
            "remote_host": "heyvoca_mysql_stg",
            "remote_port": 3306,
            "local_port": 13311,
        },
    },
    "prod": {
        "host": "127.0.0.1",
        "port": 13312,
        "user": "voca",
        "password": "voca!@34",
        "database": "heyvoca",
        "ssh_tunnel": {
            "ssh_host": "ghmate.iptime.org",
            "ssh_port": 222,
            "ssh_user": "ghmate",
            "ssh_key": "~/.ssh/ghmate_server",
            "remote_host": "heyvoca_mysql_prod",
            "remote_port": 3306,
            "local_port": 13312,
        },
    },
}

# ── SSH 터널 ────────────────────────────────────────────────────────────────

ssh_proc = None

def open_ssh_tunnel(tunnel_cfg):
    global ssh_proc
    cmd = [
        "ssh",
        "-i", tunnel_cfg["ssh_key"],
        "-p", str(tunnel_cfg["ssh_port"]),
        "-N",
        "-L", f"{tunnel_cfg['local_port']}:{tunnel_cfg['remote_host']}:{tunnel_cfg['remote_port']}",
        f"{tunnel_cfg['ssh_user']}@{tunnel_cfg['ssh_host']}",
    ]
    print(f"SSH 터널 열기: 로컬:{tunnel_cfg['local_port']} → {tunnel_cfg['remote_host']}:{tunnel_cfg['remote_port']}")
    ssh_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

def close_ssh_tunnel():
    global ssh_proc
    if ssh_proc:
        ssh_proc.terminate()
        ssh_proc = None

atexit.register(close_ssh_tunnel)
signal.signal(signal.SIGINT, lambda s, f: (close_ssh_tunnel(), sys.exit(0)))

# ── 강조 처리 로직 ──────────────────────────────────────────────────────────

def get_word_forms(word: str, verb_forms_json) -> list:
    """단어의 모든 변형형 반환 (길이 내림차순 정렬)"""
    forms = set()
    forms.add(word.lower())

    if verb_forms_json:
        try:
            vf = json.loads(verb_forms_json)
            for key in ("base", "past", "gerund", "third_sg", "past_part", "infinitive", "imperative"):
                val = vf.get(key)
                if val:
                    forms.add(val.lower())
        except (json.JSONDecodeError, TypeError):
            pass

    # 긴 형태 먼저 매칭해야 부분 치환 오류 방지
    return sorted(forms, key=len, reverse=True)


def highlight_sentence(sentence, forms):
    """예문에서 단어 변형형을 <strong class="target-word"> 태그로 감싼다."""
    if not sentence:
        return sentence

    # 이미 처리된 예문은 스킵
    if "<strong" in sentence:
        return sentence

    result = sentence
    for form in forms:
        pattern = re.compile(r'\b' + re.escape(form) + r'\b', re.IGNORECASE)

        def replacer(m):
            return f'<strong class="target-word">{m.group(0)}</strong>'

        result = pattern.sub(replacer, result)

    return result


# ── 메인 ────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    env_args = [a for a in args if not a.startswith("--")]

    if not env_args:
        print("사용법: python db/highlight_examples.py [local|dev|stg|prod] [--dry-run]")
        sys.exit(1)

    env = env_args[0]
    if env not in CONFIGS:
        print(f"알 수 없는 환경: {env}. local/dev/stg/prod 중 선택하세요.")
        sys.exit(1)

    cfg = CONFIGS[env]

    if cfg["ssh_tunnel"]:
        open_ssh_tunnel(cfg["ssh_tunnel"])

    print(f"DB 연결 중... ({env}: {cfg['host']}:{cfg['port']})")
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset="utf8mb4",
        autocommit=False,
    )

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    ve.id,
                    ve.exam_en,
                    GROUP_CONCAT(v.word SEPARATOR '|||') AS words,
                    GROUP_CONCAT(IFNULL(v.verb_forms, '') SEPARATOR '|||') AS verb_forms_list
                FROM voca_example ve
                JOIN voca_example_map vem ON ve.id = vem.example_id
                JOIN voca v ON vem.voca_id = v.id
                WHERE ve.exam_en IS NOT NULL
                  AND ve.exam_en != ''
                  AND ve.exam_en NOT LIKE '%<strong%'
                GROUP BY ve.id, ve.exam_en
            """)
            rows = cur.fetchall()

        print(f"처리 대상: {len(rows):,}개" + (" (dry-run)" if dry_run else ""))

        updated_count = 0
        skipped_count = 0
        batch = []
        BATCH_SIZE = 500

        for row in rows:
            example_id, exam_en, words_str, vf_str = row

            all_forms = set()
            for word, vf in zip(words_str.split("|||"), vf_str.split("|||")):
                for f in get_word_forms(word.strip(), vf.strip() or None):
                    all_forms.add(f)

            forms_sorted = sorted(all_forms, key=len, reverse=True)
            highlighted = highlight_sentence(exam_en, forms_sorted)

            if highlighted == exam_en:
                skipped_count += 1
                continue

            updated_count += 1
            batch.append((highlighted, example_id))

            if dry_run and updated_count <= 20:
                print(f"\n  [{example_id}] 원본: {exam_en}")
                print(f"         변환: {highlighted}")

            if not dry_run and len(batch) >= BATCH_SIZE:
                with conn.cursor() as cur:
                    cur.executemany(
                        "UPDATE voca_example SET exam_en = %s WHERE id = %s",
                        batch
                    )
                conn.commit()
                print(f"  {updated_count:,}개 업데이트...")
                batch = []

        if not dry_run and batch:
            with conn.cursor() as cur:
                cur.executemany(
                    "UPDATE voca_example SET exam_en = %s WHERE id = %s",
                    batch
                )
            conn.commit()

        print(f"\n완료!")
        print(f"  강조 처리: {updated_count:,}개")
        print(f"  단어 미매칭(변경 없음): {skipped_count:,}개")
        if dry_run:
            print("  ※ dry-run — DB 변경 없음")

    finally:
        conn.close()
        close_ssh_tunnel()


if __name__ == "__main__":
    main()
