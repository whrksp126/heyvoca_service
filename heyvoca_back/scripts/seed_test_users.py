"""테스트 사용자 시드 스크립트 (placeholder).

SETUP.md의 (선택) 시드 단계에서 호출. 실제 구현은 추후 보완.

사용 (백엔드 컨테이너 안에서):
    python /app/scripts/seed_test_users.py --count 10

현재는 안내만 출력.
"""
import argparse
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--count', '-c', type=int, default=10)
    args = parser.parse_args()
    print(f"[seed_test_users] {args.count}개 더미 사용자 생성 (TODO)")
    print("  현재는 placeholder. 추후 User/UserVocaBook/UserVoca 시드 로직 추가 예정.")
    print("  지금은 일반 회원가입 흐름으로 테스트하거나, mysql 클라이언트로 직접 INSERT 권장.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
