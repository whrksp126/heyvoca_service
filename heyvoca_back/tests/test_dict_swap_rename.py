"""사전 교체(swap)의 RENAME TABLE 문장 생성 테스트 — DB 없이 순수 함수만 검증.

교체를 dump→import 복사 대신 RENAME 한 문장으로 하므로(디스크 쓰기 0),
문장 자체가 올바른지(짝/순서/합집합)가 안전의 핵심이다.
"""
from app.services import dict_manage as dm

D, T, O = dm.DICT_SCHEMA, dm.TEMP_SCHEMA, dm.OLD_SCHEMA


def test_same_tables_pair_old_then_new():
    pairs = dm._build_swap_rename(['voca', 'voca_book'], ['voca', 'voca_book'])
    assert pairs == [
        (D, 'voca', O, 'voca'), (T, 'voca', D, 'voca'),
        (D, 'voca_book', O, 'voca_book'), (T, 'voca_book', D, 'voca_book'),
    ]
    # 같은 이름은 항상 '현재 것을 치우고 → 새 것을 넣는' 순서여야 한다
    for i, (sa, ta, sb, tb) in enumerate(pairs):
        if sa == T:
            assert pairs[i - 1] == (D, ta, O, ta)


def test_new_table_only_moves_in():
    pairs = dm._build_swap_rename(['voca'], ['voca', 'voca_label'])
    assert (T, 'voca_label', D, 'voca_label') in pairs
    assert (D, 'voca_label', O, 'voca_label') not in pairs


def test_removed_table_moves_to_old():
    pairs = dm._build_swap_rename(['voca', 'legacy'], ['voca'])
    assert (D, 'legacy', O, 'legacy') in pairs
    assert (T, 'legacy', D, 'legacy') not in pairs


def test_empty_current_schema():
    pairs = dm._build_swap_rename([], ['voca'])
    assert pairs == [(T, 'voca', D, 'voca')]


def test_rename_sql_is_single_statement():
    sql = dm._rename_sql(dm._build_swap_rename(['voca'], ['voca', 'voca_label']))
    assert sql.count('RENAME TABLE') == 1
    assert sql.endswith(';')
    assert sql == ('RENAME TABLE `heyvoca_dict`.`voca` TO `heyvoca_dict_old`.`voca`, '
                   '`heyvoca_dict_apply`.`voca` TO `heyvoca_dict`.`voca`, '
                   '`heyvoca_dict_apply`.`voca_label` TO `heyvoca_dict`.`voca_label`;')


def test_import_session_candidates_cover_write_amplification():
    joined = ' '.join(dm._IMPORT_SESSION_CANDIDATES)
    for key in ('sql_log_bin', 'unique_checks', 'foreign_key_checks',
                'innodb_flush_log_at_trx_commit'):
        assert key in joined


# ── 언어별(ja) ──────────────────────────────────────────────
import io
import json

import pytest

JA = dm.LANG_CFG['ja']
JD, JT, JO = JA['schema'], JA['temp'], JA['old']


def test_en_cfg_matches_module_constants():
    en = dm.LANG_CFG['en']
    assert (en['schema'], en['temp'], en['old']) == (D, T, O)
    assert en['prefix'] == dm.PREFIX and en['index'] == dm.INDEX_OBJECT
    assert en['gz'] is False
    # lang 기본값 = en: 인자 없이 부른 결과와 lang='en' 결과가 같아야 한다
    assert dm._build_swap_rename(['voca'], ['voca']) == \
        dm._build_swap_rename(['voca'], ['voca'], lang='en')


def test_ja_cfg_names():
    assert JD == 'heyvoca_dict_ja'
    assert (JT, JO) == ('heyvoca_dict_ja_apply', 'heyvoca_dict_ja_old')
    assert JA['prefix'] == 'dict_ja' and JA['index'] == 'dict_ja/index.json'
    assert JA['gz'] is True
    # ja 백업은 en 정리 대상(최상위 UNUSED_*)과 섞이지 않게 하위 폴더
    assert JA['archive_dir'] != dm.LANG_CFG['en']['archive_dir']


def test_unknown_lang_rejected():
    with pytest.raises(dm.DictManageError):
        dm._cfg('zz')


def test_ja_rename_uses_ja_schemas_only():
    pairs = dm._build_swap_rename(['voca', 'legacy'], ['voca', 'voca_ja'], lang='ja')
    assert pairs == [
        (JD, 'voca', JO, 'voca'), (JT, 'voca', JD, 'voca'),
        (JT, 'voca_ja', JD, 'voca_ja'),
        (JD, 'legacy', JO, 'legacy'),
    ]
    sql = dm._rename_sql(pairs)
    assert '`heyvoca_dict`.' not in sql and '`heyvoca_dict_apply`' not in sql
    assert sql.count('RENAME TABLE') == 1


def test_ja_rename_bootstrap_empty_current():
    assert dm._build_swap_rename([], ['voca', 'voca_ja'], lang='ja') == [
        (JT, 'voca', JD, 'voca'), (JT, 'voca_ja', JD, 'voca_ja')]


class _Resp:
    def __init__(self, body):
        self._b = body

    def read(self):
        return self._b

    def close(self):
        pass

    def release_conn(self):
        pass


class _Err(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


JA_INDEX = {
    'latest': '20260925-1',
    'versions': [
        {'version': '20260924-1', 'key': 'dict_ja/heyvoca_dict_ja_v20260924-1.sql.gz',
         'sha256': 'b' * 64, 'size': 2, 'counts': {'voca': 1},
         'created_at': '2026-09-24T09:43:28+00:00'},
        {'version': '20260925-1', 'key': 'dict_ja/heyvoca_dict_ja_v20260925-1.sql.gz',
         'sha256': 'a' * 64, 'size': 1, 'counts': {'voca': 2},
         'created_at': '2026-09-24T18:41:04+00:00'},
    ],
}


def _fake_minio(behaviour):
    """behaviour: role → 'ok' | 오류코드."""
    class Cli:
        def __init__(self, role):
            self.role = role

        def get_object(self, bucket, key):
            b = behaviour[self.role]
            if b != 'ok':
                raise _Err(b)
            assert key == 'dict_ja/index.json'
            return _Resp(json.dumps(JA_INDEX).encode())
    return lambda role='rw', public=False: Cli(role)


def test_ja_index_normalized_sorted(monkeypatch):
    monkeypatch.setattr(dm, '_minio', _fake_minio({'ro': 'ok', 'rw': 'ok'}))
    idx = dm._read_index('ja')
    assert idx['latest'] == '20260925-1'
    v0 = idx['versions'][0]
    assert v0['version'] == '20260925-1'
    assert v0['object'] == 'dict_ja/heyvoca_dict_ja_v20260925-1.sql.gz'
    assert v0['published_at'] == '2026-09-24T18:41:04+00:00'
    assert v0['url'].endswith('/dict_ja/heyvoca_dict_ja_v20260925-1.sql.gz')
    # 원래 ja 형식으로 되돌리면 키가 보존된다
    out = dm._ja_entry_out(v0)
    assert out == JA_INDEX['versions'][1]


def test_ja_index_ro_denied_falls_back_to_rw(monkeypatch):
    monkeypatch.setattr(dm, '_minio', _fake_minio({'ro': 'AccessDenied', 'rw': 'ok'}))
    assert dm._read_index('ja')['latest'] == '20260925-1'


def test_ja_index_both_denied_is_clear_error(monkeypatch):
    monkeypatch.setattr(dm, '_minio', _fake_minio({'ro': 'AccessDenied', 'rw': 'AccessDenied'}))
    with pytest.raises(dm.DictManageError) as ei:
        dm._read_index('ja')
    assert 'dict_ja/*' in str(ei.value) and 'GetObject' in str(ei.value)


def test_ja_index_missing_is_empty(monkeypatch):
    monkeypatch.setattr(dm, '_minio', _fake_minio({'ro': 'NoSuchKey', 'rw': 'ok'}))
    assert dm._read_index('ja') == {'latest': None, 'versions': []}


def test_ja_write_index_format(monkeypatch):
    put = {}

    class Cli:
        def put_object(self, bucket, key, data, length, **kw):
            put['key'] = key
            put['body'] = json.loads(data.read())
    monkeypatch.setattr(dm, '_minio', _fake_minio({'ro': 'ok', 'rw': 'ok'}))
    idx = dm._read_index('ja')
    monkeypatch.setattr(dm, '_minio', lambda role='rw', public=False: Cli())
    dm._write_index(idx, 'ja')
    assert put['key'] == 'dict_ja/index.json'
    assert put['body']['latest'] == '20260925-1'
    assert put['body']['versions'] == sorted(JA_INDEX['versions'],
                                             key=lambda v: v['version'], reverse=True)


def test_prune_is_per_lang(tmp_path, monkeypatch):
    en_dir, ja_dir = tmp_path, tmp_path / 'ja'
    ja_dir.mkdir()
    monkeypatch.setitem(dm.LANG_CFG['en'], 'archive_dir', str(en_dir))
    monkeypatch.setitem(dm.LANG_CFG['ja'], 'archive_dir', str(ja_dir))
    monkeypatch.setattr(dm, 'LOCAL_ARCHIVE_KEEP', 1)
    for i in range(3):
        (ja_dir / f'UNUSED_2026092{i}_before_apply_ja_x.sql.gz').write_bytes(b'x')
    (en_dir / 'UNUSED_20260920_before_apply_y.sql').write_bytes(b'x')
    removed = dm._prune_local_archives('ja')
    assert len(removed) == 2
    assert (en_dir / 'UNUSED_20260920_before_apply_y.sql').exists()
