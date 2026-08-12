"""회원 탈퇴(/withdraw)가 user.id를 참조하는 모든 테이블을 지우는지 검증.

당근 농장·스트릭처럼 기능이 나중에 추가되면서 withdraw()에 삭제 코드가 누락되면
User 삭제 시 FK 제약 위반(errno 1451)으로 탈퇴가 500 난다. 실제로 그렇게 터졌었다.
탈퇴는 평소 거의 안 밟는 경로라 수동 테스트로는 안 걸리므로 정적 검사로 막는다.

DB도 Flask app context도 필요 없이 소스를 AST로 읽어서 비교한다.
"""
import ast
import os

BACK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_PATH = os.path.join(BACK_DIR, 'app', 'models', 'models.py')
AUTH_PATH = os.path.join(BACK_DIR, 'app', 'routes', 'auth.py')

# User 자기참조(invited_by)는 삭제가 아니라 NULL 갱신으로 처리하므로 제외한다.
SELF_REFERENCING = {'User'}


def _parse(path):
    with open(path, encoding='utf-8') as f:
        return ast.parse(f.read())


def _models_referencing_user():
    """models.py에서 user.id를 FK로 참조하는 모델 클래스명 집합."""
    found = set()
    for node in ast.walk(_parse(MODELS_PATH)):
        if not isinstance(node, ast.ClassDef):
            continue
        for sub in ast.walk(node):
            if not (isinstance(sub, ast.Call) and getattr(sub.func, 'id', None) == 'ForeignKey'):
                continue
            if not sub.args or not isinstance(sub.args[0], ast.Constant):
                continue
            if sub.args[0].value == 'user.id':
                found.add(node.name)
                break
    return found - SELF_REFERENCING


def _models_queried_in_withdraw():
    """withdraw() 안에서 db.session.query(X) 로 다뤄지는 모델 클래스명 집합."""
    for node in ast.walk(_parse(AUTH_PATH)):
        if isinstance(node, ast.FunctionDef) and node.name == 'withdraw':
            return {
                sub.args[0].id
                for sub in ast.walk(node)
                if isinstance(sub, ast.Call)
                and getattr(sub.func, 'attr', None) == 'query'
                and sub.args
                and isinstance(sub.args[0], ast.Name)
            }
    raise AssertionError('auth.py에서 withdraw() 함수를 찾지 못했습니다.')


def test_withdraw_deletes_every_table_referencing_user():
    required = _models_referencing_user()
    handled = _models_queried_in_withdraw()

    missing = sorted(required - handled)
    assert not missing, (
        'user.id를 FK로 참조하는데 withdraw()에서 삭제하지 않는 모델: '
        f'{missing}\n'
        '→ 이대로 두면 해당 데이터를 가진 사용자의 탈퇴가 FK 위반(1451)으로 500 납니다. '
        'auth.py의 withdraw()에 db.session.query(모델).filter(...).delete()를 추가하세요.'
    )


def test_withdraw_covers_farm_and_streak_layer():
    """회귀 방지: 실제로 누락됐던 농장/스트릭 7종을 이름으로 못 박아 둔다."""
    handled = _models_queried_in_withdraw()
    regression = {
        'UserStreak', 'UserComebackMission', 'UserFarmItem', 'UserFarmItemLog',
        'UserFarmSetting', 'UserFarmMigration', 'FarmEventLog',
    }
    assert regression <= handled, f'과거 누락분 재발: {sorted(regression - handled)}'


def test_user_row_is_deleted_last():
    """자식 테이블 정리보다 User 삭제가 먼저 오면 FK 위반이 난다."""
    src = open(AUTH_PATH, encoding='utf-8').read()
    start = src.index('def withdraw(')
    body = src[start:src.index('\n@', start)] if '\n@' in src[start:] else src[start:]

    delete_user = body.index('db.session.delete(user)')
    last_child_delete = body.rindex('.delete()', 0, delete_user)
    assert last_child_delete < delete_user, 'User 삭제가 자식 테이블 삭제보다 앞섭니다.'
