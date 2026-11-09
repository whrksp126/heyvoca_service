"""사용자 기본값."""

# 가입 시 닉네임이 없으면 넣는 기본 닉네임(이슈 #25 3차 QA). 사용자가 온보딩에서 이름을 정하면
# 이 값은 덮어쓴다 — 기본값 그대로인 계정은 '아직 이름을 안 정한' 것으로 본다.
DEFAULT_USERNAME = '새내기 농부'


def apply_signup_username(user, username) -> None:
    """온보딩에서 받은 이름을 반영한다. 비었거나 기본 닉네임인 계정만 바꾼다(직접 정한 이름은 유지).
    받은 이름이 없고 계정에도 이름이 없으면 기본 닉네임을 넣는다."""
    name = username.strip()[:36] if isinstance(username, str) else ''
    current = user.username
    if name and (not current or current == DEFAULT_USERNAME):
        user.username = name
    elif not current:
        user.username = DEFAULT_USERNAME
