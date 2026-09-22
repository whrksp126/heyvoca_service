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
