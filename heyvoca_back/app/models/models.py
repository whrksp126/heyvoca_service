from app import db

from sqlalchemy import ForeignKey, Enum, UniqueConstraint, Index, PrimaryKeyConstraint, CheckConstraint
from sqlalchemy.schema import Column
from sqlalchemy.types import String, Integer, Date, DateTime, Boolean, Text, BigInteger, Date, TEXT, Float

from sqlalchemy.dialects.mysql import BINARY, LONGTEXT
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import relationship

from uuid import uuid4, UUID
from datetime import datetime, timedelta
import enum


### enum ###
class RecentStudyType(enum.Enum):
    TEST = "test"      # 학습
    EXAM = "exam"      # 시험
    TODAY = "today"    # 오늘의 학습
    QUICK = "quick"    # 빠른 복습
### enum ###

class BinaryUUID(TypeDecorator):
    impl = BINARY(16)
    cache_ok = True  # 캐시 키 사용을 허용하여 경고 제거

    def process_bind_param(self, value, dialect=None):
        if not value:
            return None
        if isinstance(value, UUID):
            return value.bytes
        elif isinstance(value, bytes):
            if len(value) == 16:
                return value
            raise ValueError('bytes value must be exactly 16 bytes for UUID')
        else:
            raise ValueError('value {} is not a valid UUID or bytes'.format(value))

    def process_result_value(self, value, dialect=None):
        if not value:
            return None
        else:
            return UUID(bytes=value)


class Level(db.Model):
    __tablename__ = 'level'
    id = Column(Integer, primary_key=True, nullable=False)
    level = Column(Integer, nullable=False)
    level_name = Column(String(36), nullable=False)
    level_description = Column(String(256), nullable=False)
    
    def __init__(self, level, level_name, level_description):
        self.level = level
        self.level_name = level_name
        self.level_description = level_description


class User(db.Model):
    __tablename__ = 'user'
    id = Column(BinaryUUID, primary_key=True, default=uuid4)
    level_id = Column(Integer, ForeignKey('level.id'), nullable=True)
    email = Column(String(128), nullable=False) 
    google_id = Column(String(128), nullable=True)
    apple_id = Column(String(128), nullable=True) # Apple 고유 ID 추가
    # Sign in with Apple refresh_token (authorizationCode 교환으로 최초 로그인 시에만 발급됨).
    # 회원 탈퇴 시 이 토큰으로 https://appleid.apple.com/auth/revoke 호출.
    apple_refresh_token = Column(String(512), nullable=True)
    name = Column(String(32), nullable=False)
    username = Column(String(36), nullable=True, default=None)
    phone = Column(String(16), nullable=True)
    code = Column(String(36), nullable=False)
    xp = Column(Integer, nullable=False, default=0)
    book_cnt = Column(Integer, nullable=False, default=3)
    gem_cnt = Column(Integer, nullable=False, default=0)
    set_goal_cnt = Column(Integer, nullable=False, default=3)
    refresh_token = Column(String(512), nullable=True)
    invite_code = Column(String(36), nullable=True, default=None)
    invited_by = Column(BinaryUUID, ForeignKey('user.id'), nullable=True, default=None)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_logged_at = Column(DateTime, nullable=True, default=None)
    # 사용자 TTS voice 설정. JSON 문자열 {언어: voice_short_name} 예: {"en":"en-GB-RyanNeural","ko":"ko-KR-InJoonNeural"}
    # 미설정(None)이면 언어별 기본 voice 사용. 빈 언어 키도 기본 fallback.
    tts_voices = Column(Text, nullable=True, default=None)
    # 하루에 새로 소개할 신규 단어 상한 (AI 추천 한정). 0 이하면 무제한. 기본 20.
    daily_new_limit = Column(Integer, nullable=False, default=20, server_default='20')
    # 당근 농장 부활템 보유 수 (죽은 단어 1개 부활 = 1개 소모). 보석 1개=5개 구매.
    revive_item_cnt = Column(Integer, nullable=False, default=0, server_default='0')
    # 온보딩 — 유입 경로 / 학습 목표 (맞춤 설정 수집값)
    source_channel = Column(String(50), nullable=True, default=None)
    learning_goal  = Column(String(50), nullable=True, default=None)
    # 온보딩 버전: NULL=기존 사용자(전 기능 해금), '1'=신규(세션 수 기반 점진 해금)
    onboarding_ver = Column(String(20), nullable=True, default=None)
    # 실험실 — '채팅으로 학습' 기능 ON/OFF. 알림 발송 대상 판정 + 채팅 진입 게이트.
    chat_study_enabled = Column(Boolean, nullable=False, default=False, server_default='0')

    def __init__(self, level_id, email, google_id, username, name, phone,
                last_logged_at, refresh_token, code,
                 book_cnt, gem_cnt, set_goal_cnt, apple_id=None):
        self.level_id = level_id
        self.email = email
        self.google_id = google_id
        self.apple_id = apple_id
        self.username = username
        self.name = name
        self.phone = phone
        self.refresh_token = refresh_token
        self.code = code
        self.book_cnt = book_cnt
        self.gem_cnt = gem_cnt
        self.set_goal_cnt = set_goal_cnt
        self.invite_code = uuid4().hex[:8].upper()
        self.last_logged_at = last_logged_at

    
    def is_active(self):
        return True
    
    def get_id(self):
        return self.id
    
    def is_authenticated(self):
        return True


class UserHasToken(db.Model):
    __tablename__ = 'user_has_token'
    user_id = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    token = Column(String(256), primary_key=True, nullable=False)
    is_message_allowed = Column(Boolean, nullable=False, default=True)
    is_marketing_allowed = Column(Boolean, nullable=False, default=False)

    def __init__(self, user_id, token, is_message_allowed=True, is_marketing_allowed=False):
        self.user_id = user_id
        self.token = token
        self.is_message_allowed = is_message_allowed
        self.is_marketing_allowed = is_marketing_allowed


class InviteMap(db.Model):
    __tablename__ = "invite_map"
    __table_args__ = (
        PrimaryKeyConstraint("inviter_id", "invitee_id", name="pk_invite_map"),
    )

    inviter_id = Column(BinaryUUID, ForeignKey("user.id"), nullable=False, comment="초대한 사람 (추천인)")
    invitee_id = Column(BinaryUUID, ForeignKey("user.id"), nullable=False, comment="초대받은 사람 (피추천인)")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, inviter_id, invitee_id):
        self.inviter_id = inviter_id
        self.invitee_id = invitee_id


##############
# 기본 테이블 #
##############

# 단어장
class VocaBook(db.Model):
    __tablename__ = 'voca_book'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True)
    book_nm = Column(String(255), nullable=False)
    language = Column(String(50), nullable=False)
    source = Column(String(100), nullable=False)
    category = Column(String(100), nullable=True)
    username = Column(String(100), nullable=True)
    word_count = Column(Integer, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    # 관계 정의
    voca_books = relationship("VocaBookMap", back_populates="voca_book")


# 단어 클래스 수정본
class Voca(db.Model):
    __tablename__ = 'voca'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True)
    word = Column(String(255), nullable=False, index=True)
    pronunciation = Column(String(100), nullable=True)
    verb_forms = Column(Text, nullable=True)
    # 운영 DB에 존재하던 컬럼 — 단어 난이도(0~10) + 활성 여부
    level = Column(String(50), nullable=True)
    is_active = Column(Boolean, nullable=True, default=True)

    # 관계 정의
    voca_books = relationship("VocaBookMap", back_populates="voca")
    voca_meanings = relationship("VocaMeaningMap", back_populates="voca")
    voca_examples = relationship("VocaExampleMap", back_populates="voca")
    label = relationship("VocaLabel", back_populates="voca", uselist=False,
                         cascade="all, delete-orphan")

    def __init__(self, word, pronunciation=None):
        self.word = word
        self.pronunciation = pronunciation

    def __repr__(self):
        return f"<Voca(word='{self.word}', pronunciation='{self.pronunciation}')>"


# 단어 라벨 — 외부 표준 데이터로 산출한 난이도/빈도/품사 (scripts/label_voca.py가 채움)
#
# voca 본체를 비대하게 만들지 않으려고 1:1 별도 테이블로 분리했다.
# 소스는 전부 무료·상업 사용 가능:
#   CEFR-J(TUFS) + Octanove(CC BY-SA) / wordfreq / spaCy / WordNet
class VocaLabel(db.Model):
    __tablename__ = 'voca_label'
    __bind_key__ = 'dict'

    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE'), primary_key=True)

    # 난이도. cefr는 앱이 그대로 쓰는 최종값이고, 어디서 왔는지는 cefr_source로 구분한다.
    #   cefrj/octanove = 워드리스트 검증값(신뢰 높음)
    #   freq-est       = 워드리스트에 없어 빈도로 추정한 값
    # 워드리스트가 8,827개뿐이라 5만 단어를 다 못 덮는다(검증 매칭 26%).
    # 다만 CEFR 등급별 평균 빈도가 A1 5.01 → C2 2.81로 단조 감소해,
    # 빈도로 등급을 추정해도 난이도 순서가 유지된다.
    cefr = Column(String(2), nullable=True, index=True)          # A1~C2
    cefr_source = Column(String(16), nullable=True)              # cefrj|octanove|freq-est

    # 사용빈도 Zipf (약 1~7, 클수록 흔한 단어). 다단어 표현은 구성 단어 중 최솟값.
    freq_zipf = Column(Float, nullable=True, index=True)

    pos = Column(String(16), nullable=True)          # spaCy 주 품사 (NOUN/VERB/ADJ…)
    pos_wordnet = Column(String(16), nullable=True)  # WordNet 품사 — spaCy와 교차검증용
    lemma = Column(String(255), nullable=True, index=True)  # 원형. 활용형 중복 병합에 사용
    sense_count = Column(Integer, nullable=True)     # WordNet 뜻 개수(다의어일수록 큼)

    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                        onupdate=datetime.utcnow)

    voca = relationship("Voca", back_populates="label")

    def __repr__(self):
        return f"<VocaLabel(voca_id={self.voca_id}, cefr='{self.cefr}', zipf={self.freq_zipf})>"
# 단어 뜻
class VocaMeaning(db.Model):
    __tablename__ = 'voca_meaning'
    __bind_key__ = 'dict'
    __table_args__ = (
        CheckConstraint(
            "pos IS NULL OR pos IN ('NOUN','VERB','ADJ','ADV','PRON','DET','ADP',"
            "'CCONJ','SCONJ','NUM','INTJ','PART','AUX','PROPN','X')",
            name='ck_voca_meaning_pos',
        ),
    )
    id = Column(Integer, primary_key=True)
    meaning = Column(String(255), nullable=False)
    pos = Column(String(16), nullable=True, index=True)  # 한국어 뜻풀이 기준 UD 품사

    # 관계 정의
    voca_meanings = relationship("VocaMeaningMap", back_populates="meaning")


# 단어 예문
class VocaExample(db.Model):
    __tablename__ = 'voca_example'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True)
    exam_en = Column(Text, nullable=True)
    exam_ko = Column(Text, nullable=True)

    # 관계 정의
    voca_examples = relationship("VocaExampleMap", back_populates="example")


# 서점
class Bookstore(db.Model):
    __tablename__ = 'bookstore'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    downloads = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False)
    category_id = Column(Integer, ForeignKey('bookstore_category.id'), nullable=True)
    color = Column(String(255), nullable=True)
    gem = Column(Integer, nullable=False, default=10)
    hide = Column(String(1), nullable=False)
    # 기존 단계별 서점 추천은 폐기됐다. 새 기준 확정 전까지 NULL로 유지한다.
    level_id = Column(Integer, nullable=True)
    book_id = Column(Integer, ForeignKey('voca_book.id'), nullable=True)
    admin_voca_book_id = Column(Integer, ForeignKey('admin_voca_book.id'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None, onupdate=datetime.utcnow)

    # 관계 정의
    voca_book = relationship("VocaBook")
    bookstore_category = relationship("BookstoreCategory")
    admin_voca_book = relationship("AdminVocaBook")


# 서점 카테고리 — 카테고리별 정렬 순서 관리 (admin이 DB에서 sort_order 변경)
class BookstoreCategory(db.Model):
    __tablename__ = 'bookstore_category'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True, nullable=False)
    category = Column(String(100), nullable=False)
    sort_order = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, category, sort_order=0):
        self.category = category
        self.sort_order = sort_order


##############
# 관계 테이블 #
##############

# 단어장-단어
class VocaBookMap(db.Model):
    __tablename__ = 'voca_book_map'
    __bind_key__ = 'dict'
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)
    book_id = Column(Integer, ForeignKey('voca_book.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)

    # 관계 정의
    voca = relationship("Voca", back_populates="voca_books")
    voca_book = relationship("VocaBook", back_populates="voca_books")


# 단어뜻-단어
class VocaMeaningMap(db.Model):
    __tablename__ = 'voca_meaning_map'
    __bind_key__ = 'dict'
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)
    meaning_id = Column(Integer, ForeignKey('voca_meaning.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)

    # 관계 정의
    voca = relationship("Voca", back_populates="voca_meanings")
    meaning = relationship("VocaMeaning", back_populates="voca_meanings")


# 단어예문-단어
class VocaExampleMap(db.Model):
    __tablename__ = 'voca_example_map'
    __bind_key__ = 'dict'
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)
    example_id = Column(Integer, ForeignKey('voca_example.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)

    # 관계 정의
    voca = relationship("Voca", back_populates="voca_examples")
    example = relationship("VocaExample", back_populates="voca_examples")


class DailySentence(db.Model):
    __tablename__ = 'daily_sentence'
    __bind_key__ = 'dict'
    date = Column(Date, nullable=False, primary_key=True)
    sentence = Column(String(200), nullable=False, primary_key=True)
    meaning = Column(String(200), nullable=False)


class UserVocaBook(db.Model):
    __tablename__ = 'user_voca_book'
    id = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    # cross-schema FK 제거 (bookstore는 heyvoca_dict). 컬럼은 유지.
    bookstore_id = Column(Integer, nullable=True)
    color = Column(String(256), nullable=False)
    name = Column(String(36), nullable=False)
    total_word_cnt = Column(Integer, nullable=False, default=0)
    memorized_word_cnt = Column(Integer, nullable=False, default=0)
    voca_list = Column(TEXT, nullable=True, default=None)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None)
    
    voca_maps = relationship("UserVocaBookMap", back_populates="user_voca_book", cascade="all, delete-orphan")


    def __init__(self, user_id, bookstore_id, color, name, total_word_cnt, memorized_word_cnt, voca_list, updated_at):
        self.user_id = user_id
        self.bookstore_id = bookstore_id
        self.color = color
        self.name = name
        self.total_word_cnt = total_word_cnt
        self.memorized_word_cnt = memorized_word_cnt
        self.voca_list = voca_list
        self.updated_at = updated_at


class CheckIn(db.Model):
    __tablename__ = 'check_in'
    user_id = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False, default=uuid4)
    attendence_date = Column(Date, primary_key=True, nullable=False)
    # 출석(오늘 학습함): 하루에 한 번이라도 학습 세션을 완료하면 True
    today_study_complete = Column(Boolean, nullable=False, default=False)
    # 데일리 미션 완료: 신규 목표 달성 AND 복습 잔여 0 둘 다 충족된 날만 True
    daily_mission_complete = Column(Boolean, nullable=False, default=False, server_default='0')
    # ── 당근 농장 V2 연속 학습일 (기획 11.1) ──
    # 연속 학습일의 기준은 데일리 미션이 아니라 "그날 정답 완료한 서로 다른 단어 5개"다.
    # 미션을 다 못 채운 날도 5개를 했으면 연속은 이어진다 — 그래서 별도 컬럼이 필요하다.
    correct_word_cnt = Column(Integer, nullable=False, default=0, server_default='0')
    streak_qualified = Column(Boolean, nullable=False, default=False, server_default='0')
    # 학습하지 않았지만 보호권으로 연속을 이은 날. 캘린더에서 실제 학습일과 구분해 표시한다(11.3).
    streak_protected = Column(Boolean, nullable=False, default=False, server_default='0')

    def __init__(self, user_id, attendence_date, today_study_complete, daily_mission_complete=False):
        self.user_id = user_id
        self.attendence_date = attendence_date
        self.today_study_complete = today_study_complete
        self.daily_mission_complete = daily_mission_complete
        self.correct_word_cnt = 0
        self.streak_qualified = False
        self.streak_protected = False


class UserRecentStudy(db.Model):
    __tablename__ = 'user_recent_study'
    __table_args__ = (UniqueConstraint('user_id', 'type'),)
    id = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    type = Column(Enum(RecentStudyType), nullable=False)
    study_data = Column(LONGTEXT, nullable=True)
    status = Column(String(36), nullable=True)
    progress_index = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None)

    def __init__(self, user_id, study_data, progress_index, status, type, updated_at):
        self.user_id = user_id
        self.study_data = study_data
        self.progress_index = progress_index
        self.status = status
        self.type = type
        self.updated_at = updated_at


class UserGoals(db.Model):
    __tablename__ = 'user_goals'
    user_id = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    goal_id = Column(Integer, ForeignKey('goals.id'), primary_key=True, nullable=False)
    current_value = Column(Integer, nullable=False)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)

    def __init__(self, user_id, goal_id, current_value, is_completed, completed_at):
        self.user_id = user_id
        self.goal_id = goal_id
        self.current_value = current_value
        self.is_completed = is_completed
        self.completed_at = completed_at


class GoalType(db.Model):
    __tablename__ = 'goal_type'
    id = Column(Integer, primary_key=True, nullable=False)
    type = Column(String(36), nullable=False)
    description = Column(String(36), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, type, description):
        self.type = type
        self.description = description


class Goals(db.Model):
    __tablename__ = 'goals'
    id = Column(Integer, primary_key=True, nullable=False)
    type_id = Column(Integer, ForeignKey('goal_type.id'), nullable=False)
    level = Column(Integer, nullable=False)
    goal = Column(Integer, nullable=False)
    reward_count = Column(Integer, nullable=False)
    goal_text = Column(String(255), nullable=True) # 추가: 업적 달성 기준 텍스트 (예: '친구 초대 1명 달성')
    description = Column(String(512), nullable=True)
    badge_img = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, type_id, level, goal, reward_count, goal_text, description, badge_img):
        self.type_id = type_id
        self.level = level
        self.goal = goal
        self.reward_count = reward_count
        self.goal_text = goal_text
        self.description = description
        self.badge_img = badge_img


##############
# 구매 관련 테이블 #
##############


# 상품 정보
class Product(db.Model):
    __tablename__ = 'product'
    id = Column(Integer, primary_key=True, nullable=False)
    product_id = Column(String(100), nullable=False)  # 스토어 상품 ID
    name = Column(String(100), nullable=False)  # 상품명
    description = Column(String(500), nullable=True)  # 상품 설명
    gem_amount = Column(Integer, nullable=False)  # 지급할 보석 수량
    price = Column(Integer, nullable=False)  # 가격 (원)
    platform = Column(String(20), nullable=False)  # ios, android
    bonus = Column(Integer, nullable=True, default=0)  # 보너스 보석 수량
    image_url = Column(String(500), nullable=True)  # 상품 이미지 URL (S3 경로)
    is_active = Column(Boolean, nullable=False, default=True)  # 판매 여부
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None)

    def __init__(self, product_id, name, description, gem_amount, price, platform, bonus=0, image_url=None, is_active=True):
        self.product_id = product_id
        self.name = name
        self.description = description
        self.gem_amount = gem_amount
        self.price = price
        self.platform = platform
        self.bonus = bonus
        self.image_url = image_url
        self.is_active = is_active


# 구매 기록
class Purchase(db.Model):
    __tablename__ = 'purchase'
    id = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    product_id = Column(String(100), nullable=False)  # 스토어 상품 ID
    transaction_id = Column(String(200), nullable=False)  # 스토어 거래 ID
    platform = Column(String(20), nullable=False)  # ios, android
    gem_amount = Column(Integer, nullable=False)  # 구매한 보석 수량
    price = Column(Integer, nullable=False)  # 구매 가격
    status = Column(String(20), nullable=False, default='completed')  # completed, refunded, failed
    receipt_data = Column(Text, nullable=True)  # 영수증 원본 데이터
    verified_at = Column(DateTime, nullable=False, default=datetime.utcnow)  # 검증 완료 시간
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None)

    def __init__(self, user_id, product_id, transaction_id, platform, gem_amount, price, 
                 status='completed', receipt_data=None):
        self.user_id = user_id
        self.product_id = product_id
        self.transaction_id = transaction_id
        self.platform = platform
        self.gem_amount = gem_amount
        self.price = price
        self.status = status
        self.receipt_data = receipt_data


### 보석 로그용 ###
class GemReason(enum.Enum):
    IAP_PURCHASE  = "IAP_PURCHASE"    # 유료 결제 충전
    BOOK_PURCHASE = "BOOK_PURCHASE"   # 단어장 구매
    ACHIEVEMENT   = "ACHIEVEMENT"     # 업적 보상
    ADMIN_ADJUST  = "ADMIN_ADJUST"    # 관리자 조정
    REFUND        = "REFUND"          # 환불(보석 회수)
    REFERRAL      = "REFERRAL"        # 초대 보상
    COMBO_PROTECT = "COMBO_PROTECT"   # 콤보 보호(보석 차감)
    ITEM_PURCHASE = "ITEM_PURCHASE"   # 게임 아이템 구매(부활템 등)
    FARM_REWARD   = "FARM_REWARD"     # 당근 농장 보상(2차 승급 등)
    ONBOARDING_MISSION = "ONBOARDING_MISSION"  # 온보딩 행동 기반 미션 완료 보상


class GemLog(db.Model):
    __tablename__ = 'gem_log'
    __table_args__ = (
        Index('ix_gemlog_src', 'user_id', 'source_type', 'source_id'),
    )

    id = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # ex) +20, -20
    reason = Column(Enum(GemReason), nullable=False)
    description = Column(String(255), nullable=True)    # 화면용
    # 관련 엔티티 조인용(필요 시만 세팅)
    source_type = Column(String(40), nullable=True)   # 'purchase','bookstore','goal' 등
    source_id   = Column(BinaryUUID, nullable=True)   # 해당 테이블의 PK(UUID)
    # 관련 엔티티 조인용(필요 시만 세팅)
    balance_after = Column(Integer, nullable=False)  # 이 로그 반영 직후의 보석 잔액
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, user_id, amount, reason, description, source_type, source_id, balance_after):
        self.user_id = user_id
        self.amount = amount
        self.reason = reason
        self.description = description
        self.source_type = source_type
        self.source_id = source_id
        self.balance_after = balance_after

### 보석 로그용 ###


### 게임 레이어 (콤보) ###
class UserCombo(db.Model):
    """AI 추천 테스트 전역 연속 정답 콤보 (세션·날짜 경계 무관, 오답 시 리셋).

    status:
      ACTIVE  — 정상 적립 중
      AT_RISK — 오답 직후 보호 팝업 대기 (at_risk_combo에 위기 직전 값 보존)
    """
    __tablename__ = 'user_combo'

    user_id       = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    current_combo = Column(Integer, nullable=False, default=0)
    best_combo    = Column(Integer, nullable=False, default=0)
    status        = Column(String(8), nullable=False, default='ACTIVE')  # ACTIVE | AT_RISK
    at_risk_combo = Column(Integer, nullable=True)   # 위기 직전 콤보 (보호 성공 시 복원값)
    at_risk_at    = Column(DateTime, nullable=True)
    updated_at    = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, user_id):
        self.user_id = user_id
        self.current_combo = 0
        self.best_combo = 0
        self.status = 'ACTIVE'


### 당근 농장 V2 상수 ###

class VisualStage:
    """시각적 성장 단계. FSRS 분류에서 파생하되 **한 번 도달한 단계는 내려가지 않는다**(기획 5.2).

    UNPLANTED_SEED 와 PLANTED_SEED 는 FSRS 로 구분할 수 없다 —
    둘 다 unlearned/short 구간이고, 갈리는 건 '첫 독립 정답을 했는가'이기 때문이다.
    그래서 파생이 아니라 저장한다.
    """
    UNPLANTED_SEED = 'UNPLANTED_SEED'   # 보유 씨앗 — 아직 심지 않음. 썩지 않는다(6.4)
    PLANTED_SEED   = 'PLANTED_SEED'     # 심은 씨앗 — 첫 독립 정답 완료
    SPROUT         = 'SPROUT'           # 새싹 — 첫 예정 복습 이후 독립 정답
    LEAF           = 'LEAF'             # 잎 — 안정성 10일 이상
    CARROT         = 'CARROT'           # 당근 — 안정성 60일 이상
    GOLDEN         = 'GOLDEN'           # 황금 당근 — 부패 면역

    ORDER = [UNPLANTED_SEED, PLANTED_SEED, SPROUT, LEAF, CARROT, GOLDEN]

    @classmethod
    def rank(cls, stage):
        try:
            return cls.ORDER.index(stage)
        except ValueError:
            return 0


class HealthState:
    """건강 상태. 성장 단계와 **독립된 축**이다 — 썩은 당근이 존재한다(기획 6)."""
    FRESH    = 'FRESH'       # 촉촉함 — 예정일 전
    THIRSTY  = 'THIRSTY'     # 목마름 — 예정일 도달~초기 지연
    WILTED   = 'WILTED'      # 시듦
    CRITICAL = 'CRITICAL'    # 심한 시듦 — 부패 직전
    ROTTEN   = 'ROTTEN'      # 부패 — 다시 심기/회복 전까지 학습 불가
    GOLDEN   = 'GOLDEN'      # 황금 — 부패 면역


class FarmItem:
    """V2 에서 보유·구매 가능한 농장 아이템 3종(기획 8.1). 그 외는 이번 범위 밖이다."""
    SHOVEL   = 'SHOVEL'      # 새심기 삽 — 부패 작물을 심은 씨앗부터 다시
    NUTRIENT = 'NUTRIENT'    # 영양 회복제 — 부패 작물의 과거 단계 보존
    SHIELD   = 'SHIELD'      # 연속 학습 보호권 — 놓친 하루 보호

    ALL = [SHOVEL, NUTRIENT, SHIELD]


class FarmEvent:
    """기획 16.2 필수 이벤트. 문자열로 두는 이유는 Enum 이면 이벤트 하나 늘 때마다
    ALTER TABLE 이 필요해서다 — 운영 중 이벤트는 계속 늘어난다."""
    SEED_ACQUIRED   = 'SEED_ACQUIRED'
    SEED_PLANTED    = 'SEED_PLANTED'
    SPROUTED        = 'SPROUTED_AFTER_DELAYED_RECALL'
    REVIEW_WATERED  = 'REVIEW_WATERED'
    STAGE_UP        = 'STAGE_UP'
    WATERING_INCOMPLETE = 'WATERING_INCOMPLETE'
    WILT_STARTED    = 'WILT_STARTED'
    CRITICAL_STARTED = 'CRITICAL_STARTED'
    ROTTEN_CONFIRMED = 'ROTTEN_CONFIRMED'
    SHOVEL_EARNED    = 'RESHOVEL_EARNED'
    SHOVEL_PURCHASED = 'RESHOVEL_PURCHASED'
    SHOVEL_SPENT     = 'RESHOVEL_SPENT'
    REPLANTED        = 'REPLANTED_WITH_SHOVEL'
    RECOVERED        = 'RECOVERED_WITH_ITEM'
    PROTECTION_APPLIED = 'PROTECTION_APPLIED'   # 무료 긴급 급수(8.4)
    GOLDEN_ACHIEVED  = 'GOLDEN_ACHIEVED'
    GOLDEN_CHECKED   = 'GOLDEN_CHECKED'
    STREAK_PROTECTED = 'STREAK_PROTECTED'


class UserVocaGame(db.Model):
    """당근 농장 게임 레이어 — UserVoca 1:1. FSRS 데이터(UserVoca.data)는 절대 건드리지 않음.

    V1 은 life(ALIVE/DEAD) 하나로 생사만 봤고 성장 단계는 전부 FSRS 파생이었다.
    V2 는 두 축을 분리한다 — **성장 단계**(visual_stage)와 **건강 상태**(health_state).
    성장은 오답으로 내려가지 않고, 건강은 방치로만 나빠진다.

    life 는 V1 호환을 위해 남겨 두고 마이그레이션이 visual_stage/health_state 로 옮긴다.
    """
    __tablename__ = 'user_voca_game'

    user_voca_id   = Column(Integer, ForeignKey('user_voca.id'), primary_key=True, nullable=False)
    user_id        = Column(BinaryUUID, ForeignKey('user.id'), nullable=False, index=True)
    life           = Column(String(8), nullable=False, default='ALIVE')  # V1 잔존 — ALIVE | DEAD
    died_at        = Column(DateTime, nullable=True)     # 죽음 확정 시각
    death_seen     = Column(Boolean, nullable=False, default=False)  # 죽음 연출 노출 여부
    deaths_cnt     = Column(Integer, nullable=False, default=0)  # 누적 죽은 횟수 (밸런싱 관찰용)
    revives_cnt    = Column(Integer, nullable=False, default=0)  # 누적 부활 횟수
    carrot_rewarded = Column(Boolean, nullable=False, default=False)  # 당근 첫 도달 보상 지급 여부

    # ── V2 성장 축 ──────────────────────────────────────────────
    visual_stage   = Column(String(16), nullable=False,
                            default=VisualStage.UNPLANTED_SEED, server_default='UNPLANTED_SEED')
    # 오답·부패로 visual_stage 가 내려가도 이 값은 보존한다(기획 5.2 "최고 도달 단계는 영구 보존")
    highest_stage  = Column(String(16), nullable=False,
                            default=VisualStage.UNPLANTED_SEED, server_default='UNPLANTED_SEED')
    first_planted_at = Column(DateTime, nullable=True)   # 첫 독립 정답 = 심기 완료 시각
    # 새싹 판정 조건 2 — "현재 현지 학습일 > 심은 현지 학습일". UTC 시각만으로는 못 따진다.
    planted_study_day = Column(Date, nullable=True)
    # 새싹 판정 조건 3 — 심은 직후 FSRS 가 잡은 첫 예정 복습 시각
    first_due_at   = Column(DateTime, nullable=True)
    first_sprouted_at = Column(DateTime, nullable=True)
    sprout_rewarded = Column(Boolean, nullable=False, default=False, server_default='0')
    leaf_rewarded   = Column(Boolean, nullable=False, default=False, server_default='0')

    # ── V2 건강 축 ──────────────────────────────────────────────
    # 조회 시 계산이 원칙이지만(6.3), 상태 '전이'를 감지해 이벤트를 남기려면 직전 값이 필요하다.
    health_state   = Column(String(10), nullable=False,
                            default=HealthState.FRESH, server_default='FRESH')
    health_changed_at   = Column(DateTime, nullable=True)
    last_health_seen_at = Column(DateTime, nullable=True)   # 사용자가 그 상태를 화면에서 본 시각
    # 부패 예정 시각(D+G). 무료 긴급 급수(8.4)로 하루씩 밀린다 — 밀린 결과를 여기 적는다.
    rot_due_at     = Column(DateTime, nullable=True)
    protection_days = Column(Integer, nullable=False, default=0, server_default='0')
    rotten_at      = Column(DateTime, nullable=True)

    # ── 부패 후 처리 ────────────────────────────────────────────
    recovery_count = Column(Integer, nullable=False, default=0, server_default='0')
    replant_count  = Column(Integer, nullable=False, default=0, server_default='0')
    # 삽/회복제를 예약했지만 진단을 못 끝낸 상태(7.2 "다시 심기 미완료").
    # 다음 진입에서 **추가 차감 없이** 진단을 이어가야 하므로 예약 사실을 남긴다.
    pending_action = Column(String(12), nullable=True)   # REPLANT | RECOVER
    pending_started_at = Column(DateTime, nullable=True)

    # ── 황금 당근 ───────────────────────────────────────────────
    golden_at      = Column(DateTime, nullable=True)
    golden_check_status = Column(String(12), nullable=True)   # PENDING | PASSED | FAILED

    updated_at     = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        # 홈·단어장 화면이 "이 사용자의 단계별/상태별 개수"를 매번 센다
        Index('ix_uvg_user_stage', 'user_id', 'visual_stage'),
        Index('ix_uvg_user_health', 'user_id', 'health_state'),
        # 부패 임박 작물을 오늘 학습 상단에 올리려면 마감 시각으로 정렬해야 한다
        Index('ix_uvg_user_rotdue', 'user_id', 'rot_due_at'),
    )

    def __init__(self, user_voca_id, user_id):
        self.user_voca_id = user_voca_id
        self.user_id = user_id
        self.life = 'ALIVE'
        self.death_seen = False
        self.deaths_cnt = 0
        self.revives_cnt = 0
        self.carrot_rewarded = False
        self.visual_stage = VisualStage.UNPLANTED_SEED
        self.highest_stage = VisualStage.UNPLANTED_SEED
        self.health_state = HealthState.FRESH
        self.sprout_rewarded = False
        self.leaf_rewarded = False
        self.recovery_count = 0
        self.replant_count = 0
        self.protection_days = 0


class UserFarmItem(db.Model):
    """농장 아이템 보유량 — (사용자, 아이템) 1행.

    User 에 컬럼을 늘리지 않고 테이블로 둔 이유는 아이템이 늘 때마다
    user 테이블에 ALTER 가 필요해지기 때문이다. 기획 8.5 의 후속 아이템
    (퇴비 조각·물탱크 등)이 언제든 들어올 수 있다.

    V1 의 User.revive_item_cnt 는 그대로 두고 마이그레이션이 NUTRIENT 로 옮긴다(15.3).
    """
    __tablename__ = 'user_farm_item'

    user_id   = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    item_type = Column(String(12), primary_key=True, nullable=False)   # FarmItem.*
    qty       = Column(Integer, nullable=False, default=0, server_default='0')
    # 밸런싱 관찰용 누적치 — qty 만 보면 "많이 벌어 많이 썼다"와 "안 벌고 안 썼다"가 같아 보인다
    total_earned = Column(Integer, nullable=False, default=0, server_default='0')
    total_spent  = Column(Integer, nullable=False, default=0, server_default='0')
    updated_at   = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, user_id, item_type, qty=0):
        self.user_id = user_id
        self.item_type = item_type
        self.qty = qty
        self.total_earned = qty
        self.total_spent = 0


class FarmItemReason(enum.Enum):
    """아이템 증감 사유. GemReason 과 같은 자리의 개념이다."""
    STAGE_REWARD   = "STAGE_REWARD"     # 성장 단계 최초 도달 보상 (8.2)
    STREAK_REWARD  = "STREAK_REWARD"    # 연속 학습 마일스톤 (11.4)
    WEEKLY_GRANT   = "WEEKLY_GRANT"     # 보호권 주간 지급 (11.3)
    GEM_PURCHASE   = "GEM_PURCHASE"     # 보석으로 구매
    SPENT          = "SPENT"            # 사용 (다시 심기 / 회복 / 연속 보호)
    MIGRATION      = "MIGRATION"        # V2 전환 보상 (15.3)
    ADMIN_ADJUST   = "ADMIN_ADJUST"
    EVENT          = "EVENT"            # 운영 이벤트


class UserFarmItemLog(db.Model):
    """아이템 증감 원장. GemLog 와 같은 형태로 둔다 — 운영 도구와 정산 로직을 대칭으로 쓰기 위해서다.

    잔액(balance_after)을 함께 적는 이유도 GemLog 와 같다. 보유량이 어긋났을 때
    어느 시점부터 틀어졌는지 로그만으로 되짚을 수 있어야 한다.
    """
    __tablename__ = 'user_farm_item_log'
    __table_args__ = (
        Index('ix_ufil_user_created', 'user_id', 'created_at'),
    )

    id        = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    # 단일 인덱스를 따로 두지 않는다 — ix_ufil_user_created 가 user_id 로 시작해 이미 커버한다
    user_id   = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    item_type = Column(String(12), nullable=False)
    amount    = Column(Integer, nullable=False)          # +5, -1
    reason    = Column(Enum(FarmItemReason), nullable=False)
    balance_after = Column(Integer, nullable=False)
    description   = Column(String(255), nullable=True)   # 화면용
    # 관련 엔티티 (있을 때만) — 어떤 단어의 성장 보상인지, 어떤 결제로 산 것인지
    user_voca_id = Column(Integer, nullable=True)
    purchase_id  = Column(BinaryUUID, nullable=True)
    created_at   = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, user_id, item_type, amount, reason, balance_after,
                 description=None, user_voca_id=None, purchase_id=None):
        self.user_id = user_id
        self.item_type = item_type
        self.amount = amount
        self.reason = reason
        self.balance_after = balance_after
        self.description = description
        self.user_voca_id = user_voca_id
        self.purchase_id = purchase_id


class FarmEventLog(db.Model):
    """작물 상태 전이 로그 (기획 16.2).

    **매 학습마다 쌓는 로그가 아니다.** 정답/오답 자체는 이미 UserStudyLog 에 있고,
    여기에 또 적으면 같은 볼륨의 테이블이 하나 더 생긴다. 이 테이블에는
    **상태가 실제로 바뀐 순간**만 남긴다 — 심기, 발아, 단계 상승, 시듦 진입,
    부패 확정, 아이템 적용, 황금 판정.

    from_state/to_state 는 이벤트마다 의미가 다르다(성장 단계이거나 건강 상태).
    한 컬럼으로 합친 이유는 조회가 언제나 "이 단어가 어떻게 흘러왔는가" 단위라서다.
    """
    __tablename__ = 'farm_event_log'
    __table_args__ = (
        Index('ix_fel_user_created', 'user_id', 'created_at'),
        Index('ix_fel_voca_created', 'user_voca_id', 'created_at'),
        Index('ix_fel_event_created', 'event', 'created_at'),
    )

    id        = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id   = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    user_voca_id = Column(Integer, nullable=True)        # 단어와 무관한 이벤트(STREAK_PROTECTED)는 NULL
    event     = Column(String(40), nullable=False)       # FarmEvent.*
    from_state = Column(String(16), nullable=True)
    to_state   = Column(String(16), nullable=True)
    reason     = Column(String(40), nullable=True)       # 'CORRECT' / 'OVER_DAILY_LIMIT' / 'ITEM_NUTRIENT' 등
    session_id = Column(BinaryUUID, nullable=True)       # user_study_session.id
    purchase_id = Column(BinaryUUID, nullable=True)
    detail     = Column(String(255), nullable=True)      # 수치 등 부가 정보(JSON 문자열)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, user_id, event, user_voca_id=None, from_state=None, to_state=None,
                 reason=None, session_id=None, purchase_id=None, detail=None):
        self.user_id = user_id
        self.event = event
        self.user_voca_id = user_voca_id
        self.from_state = from_state
        self.to_state = to_state
        self.reason = reason
        self.session_id = session_id
        self.purchase_id = purchase_id
        self.detail = detail


class UserFarmSetting(db.Model):
    """사용자별 농장 운영 기준값.

    시간대를 저장하는 이유는 연속 학습일과 부패 판정이 **사용자 현지 자정** 기준이기 때문이다
    (11.2). 지금 코드는 KST 를 상수로 박아 두었는데, 그대로 두면 해외 사용자의 하루가
    엉뚱하게 끊긴다.

    tz_changed_at 은 시간대 변경 24시간 쿨다운용이다(6.3) — 자정 직전에 시간대를 옮겨
    하루를 두 번 벌거나 부패를 무한정 미루는 걸 막는다.
    """
    __tablename__ = 'user_farm_setting'

    user_id     = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    timezone    = Column(String(40), nullable=False, default='Asia/Seoul', server_default='Asia/Seoul')
    tz_changed_at = Column(DateTime, nullable=True)
    # 하루 권장 복습 개수. 무료 긴급 급수(8.4)는 "이 값을 넘겨서 오늘 목록에 못 든" 작물에만 붙는다.
    daily_review_limit = Column(Integer, nullable=False, default=60, server_default='60')
    updated_at  = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, user_id, timezone='Asia/Seoul'):
        self.user_id = user_id
        self.timezone = timezone


class UserStreak(db.Model):
    """연속 학습일 (기획 11).

    지금의 끈기왕은 CheckIn 을 매번 훑어 계산한다. V2 는 보호권 소모·48시간 복구 기한처럼
    **계산으로 복원할 수 없는 상태**가 붙으므로 별도로 들고 있어야 한다.

    current_streak 은 기존 끈기왕 숫자를 그대로 승계한다(마이그레이션에서).
    """
    __tablename__ = 'user_streak'

    user_id        = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    current_streak = Column(Integer, nullable=False, default=0, server_default='0')
    best_streak    = Column(Integer, nullable=False, default=0, server_default='0')
    # 마지막으로 "5개 정답"을 채운 현지 학습일. 오늘/어제와 비교해 연속 여부를 판정한다.
    last_qualified_day = Column(Date, nullable=True)
    # 마일스톤은 한 번만 준다(11.4). 최고 도달 값 하나면 충분하다 —
    # 기록이 끊겨 3일에 다시 도달해도 3 <= max 라 재지급되지 않는다.
    max_milestone_awarded = Column(Integer, nullable=False, default=0, server_default='0')
    # 보호권 주간 지급 — 지급한 주의 월요일(현지). 접속 안 한 주는 소급하지 않으므로
    # "이번 주 월요일 > 이 값" 하나로 판정된다.
    shield_granted_week = Column(Date, nullable=True)
    protected_days_cnt  = Column(Integer, nullable=False, default=0, server_default='0')
    # 보호권 없이 하루를 놓쳤을 때의 48시간 복구 기한. 지나면 기록 종료.
    recovery_deadline   = Column(DateTime, nullable=True)
    recovery_from_streak = Column(Integer, nullable=True)   # 복구했을 때 되살릴 값
    updated_at     = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, user_id, current_streak=0, best_streak=0, last_qualified_day=None):
        self.user_id = user_id
        self.current_streak = current_streak
        self.best_streak = max(best_streak, current_streak)
        self.last_qualified_day = last_qualified_day
        self.max_milestone_awarded = 0
        self.protected_days_cnt = 0


class UserComebackMission(db.Model):
    """복귀 농장 회복 미션 (기획 7.4).

    30일 이상 비운 사용자에게 부패 수백 개를 그대로 보여주지 않기 위한 완충 장치다.
    복귀 후 연속 3일 매일 5개를 채우면 복귀 시점에 이미 썩어 있던 작물에
    영양 회복제와 같은 효능을 일괄 적용한다.

    사용자당 여러 번 복귀할 수 있으므로 1:1 이 아니라 이력이다.
    """
    __tablename__ = 'user_comeback_mission'
    __table_args__ = (
        Index('ix_ucm_user_status', 'user_id', 'status'),
    )

    id         = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    # ix_ucm_user_status 가 user_id 로 시작하므로 단일 인덱스는 두지 않는다
    user_id    = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    absent_days = Column(Integer, nullable=False)        # 판정 근거 — 며칠 비웠는가
    rotten_snapshot = Column(Integer, nullable=False, default=0, server_default='0')  # 복귀 시점 부패 수
    progress_days   = Column(Integer, nullable=False, default=0, server_default='0')  # 0~3
    last_progress_day = Column(Date, nullable=True)
    # ACTIVE | COMPLETED | EXPIRED — 하루 놓치면 progress_days 만 0 으로 돌리고 ACTIVE 를 유지한다.
    # 7일 창을 넘기면 EXPIRED.
    status      = Column(String(12), nullable=False, default='ACTIVE', server_default='ACTIVE')
    expires_at  = Column(DateTime, nullable=True)        # started_at + 7일
    rewarded_at = Column(DateTime, nullable=True)
    recovered_cnt = Column(Integer, nullable=False, default=0, server_default='0')

    def __init__(self, user_id, absent_days, rotten_snapshot=0, expires_at=None):
        self.user_id = user_id
        self.absent_days = absent_days
        self.rotten_snapshot = rotten_snapshot
        self.progress_days = 0
        self.status = 'ACTIVE'
        self.expires_at = expires_at


class UserFarmMigration(db.Model):
    """V2 전환 1회성 기록 (기획 15).

    이 테이블의 본 목적은 **중복 지급 방지**다. 전환은 첫 접속 때 한 번 도는데,
    그 사이 요청이 겹치거나 배포가 롤백됐다 다시 오르면 보상이 두 번 나갈 수 있다.
    user_id 를 PK 로 두어 두 번째 시도가 아예 들어가지 못하게 한다.

    지급 내역을 남기는 두 번째 이유는 첫 접속 결과 슬라이드에서 그대로 읽어 쓰기 위해서다.
    """
    __tablename__ = 'user_farm_migration'

    user_id      = Column(BinaryUUID, ForeignKey('user.id'), primary_key=True, nullable=False)
    migrated_at  = Column(DateTime, nullable=False, default=datetime.utcnow)
    words_total  = Column(Integer, nullable=False, default=0, server_default='0')
    # 지연·죽음 상태여서 '전환 전용 영양 회복'이 자동 적용된 개수(15.2)
    auto_recovered = Column(Integer, nullable=False, default=0, server_default='0')
    shovel_granted   = Column(Integer, nullable=False, default=0, server_default='0')
    nutrient_granted = Column(Integer, nullable=False, default=0, server_default='0')
    shield_granted   = Column(Integer, nullable=False, default=0, server_default='0')
    gem_granted      = Column(Integer, nullable=False, default=0, server_default='0')
    # 전환 후 30일간 추가 부패 보호(15.2) — 이 시각까지는 기존 단어를 썩히지 않는다
    protect_until = Column(DateTime, nullable=True)
    seen_at       = Column(DateTime, nullable=True)   # 결과 슬라이드를 실제로 본 시각

    def __init__(self, user_id, words_total=0, protect_until=None):
        self.user_id = user_id
        self.words_total = words_total
        self.protect_until = protect_until
### 게임 레이어 (콤보 / 농장) ###


### 재편성된 단어장 ###
class AdminVocaBook(db.Model):
    __tablename__ = 'admin_voca_book'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True)
    book_nm = Column(String(255), nullable=False)
    language = Column(String(50), nullable=False)
    source = Column(String(100), nullable=False)
    category = Column(String(100), nullable=True)
    username = Column(String(100), nullable=True)
    word_count = Column(Integer, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    # 관계 정의
    voca_books = relationship("AdminVocaBookMap", back_populates="voca_book")


class AdminVocaBookMap(db.Model):
    __tablename__ = 'admin_voca_book_map'
    __bind_key__ = 'dict'
    __table_args__ = (
        UniqueConstraint('book_id', 'voca_id', name='uq_admin_voca_book_map_book_voca'),
    )
    id = Column(Integer, primary_key=True)
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE'))
    book_id = Column(Integer, ForeignKey('admin_voca_book.id', ondelete='CASCADE'))
    level = Column(Integer, nullable=True)
    voca_meanings = Column(TEXT, nullable=True)
    voca_examples = Column(TEXT, nullable=True)

    # 관계 정의
    voca = relationship("Voca")
    voca_book = relationship("AdminVocaBook")


class UserVocaBookMap(db.Model):
    __tablename__ = 'user_voca_book_map'
    id = Column(Integer, primary_key=True)
    user_voca_book_id = Column(BinaryUUID, ForeignKey('user_voca_book.id'))
    user_voca_id = Column(Integer, ForeignKey('user_voca.id'))
    level = Column(Integer, nullable=True)
    voca_meanings = Column(TEXT, nullable=True, comment='admin 사전의 voca일 경우 null')
    voca_examples = Column(TEXT, nullable=True, comment='admin 사전의 voca일 경우 null')
    memory_status = Column(TEXT, nullable=True)

    # 관계 정의
    user_voca_book = relationship("UserVocaBook", back_populates="voca_maps")
    user_voca = relationship("UserVoca", back_populates="book_maps")



class UserVoca(db.Model):
    __tablename__ = 'user_voca'
    id = Column(Integer, primary_key=True)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    # cross-schema FK 제거 (voca는 heyvoca_dict). 컬럼은 유지.
    voca_id = Column(Integer, nullable=True)
    word = Column(String(255), nullable=True)
    voca_meanings = Column(TEXT, nullable=True)
    voca_examples = Column(TEXT, nullable=True)
    data = Column(TEXT, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None)

    # 관계 정의
    user = relationship("User")
    # cross-schema relationship: voca_id가 다른 schema(dict)의 voca를 가리킴.
    # FK 제약이 없으므로 primaryjoin + foreign() 명시.
    # uselist=False — many-to-one (한 UserVoca당 한 Voca).
    voca = relationship(
        "Voca",
        primaryjoin="UserVoca.voca_id == foreign(Voca.id)",
        uselist=False,
        viewonly=True,
    )
    book_maps = relationship("UserVocaBookMap", back_populates="user_voca", cascade="all, delete-orphan")

    def __init__(self, user_id=None, voca_id=None, word=None, voca_meanings=None, voca_examples=None, data=None):
        self.user_id = user_id
        self.voca_id = voca_id
        self.word = word
        self.voca_meanings = voca_meanings
        self.voca_examples = voca_examples
        self.data = data
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

### 재편성된 단어장 ###


### 학습 로그 (FSRS Phase 1.1 — 영구 학습 이력 저장) ###

class UserStudySession(db.Model):
    """학습 세션 단위 집계. 여러 UserStudyLog를 묶는 컨테이너."""
    __tablename__ = 'user_study_session'

    id            = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id       = Column(BinaryUUID, ForeignKey('user.id'), nullable=False, index=True)
    test_type     = Column(String(16), nullable=False, comment='test|exam|today|quick')
    book_ids      = Column(TEXT, nullable=True, comment='JSON 배열: ["uuid",...]')
    question_count = Column(Integer, nullable=False, default=0)
    correct_count  = Column(Integer, nullable=False, default=0)
    started_at    = Column(DateTime, nullable=False, default=datetime.utcnow)
    finished_at   = Column(DateTime, nullable=True)
    # 온보딩 가입 직후(/onboarding/migrate)가 만든 맛보기 이전 세션 표식.
    # unlock_status의 완료 세션 카운트(정규 학습 횟수)에서 제외하기 위한 마커 — 정규 학습만 카운트.
    is_onboarding = Column(Boolean, nullable=False, default=False, server_default='0')

    # 관계 정의 (session_id에 FK가 없으므로 primaryjoin/foreign 명시)
    logs = relationship(
        'UserStudyLog',
        back_populates='session',
        cascade='all, delete-orphan',
        primaryjoin='UserStudySession.id == foreign(UserStudyLog.session_id)',
    )

    def __init__(self, user_id, test_type, book_ids=None, question_count=0, correct_count=0,
                 finished_at=None, is_onboarding=False):
        self.user_id        = user_id
        self.test_type      = test_type
        self.book_ids       = book_ids
        self.question_count = question_count
        self.correct_count  = correct_count
        self.finished_at    = finished_at
        self.is_onboarding   = is_onboarding


class UserStudyLog(db.Model):
    """단어 1회 응답 로그. SM2 q_score + FSRS rating 병기 (Phase 1.2부터 rating 채움).

    파티셔닝 (c3e8a10b4d22):
      PARTITION BY RANGE (YEAR(created_at)) 적용.
      MySQL 파티션 테이블에 FK 불가 → user_id/user_voca_id/user_voca_book_id 모두 FK 없음.
      PK = (id, created_at) 복합키 — 파티션 컬럼이 PK에 포함돼야 하는 MySQL 제약.
    """
    __tablename__ = 'user_study_log'
    __table_args__ = (
        # 파티션 컬럼(created_at)이 PK에 포함돼야 MySQL PARTITION BY RANGE 사용 가능
        PrimaryKeyConstraint('id', 'created_at'),
        Index('ix_usl_user_created', 'user_id', 'created_at'),
        Index('ix_usl_user_voca',    'user_id', 'user_voca_id'),
        Index('ix_usl_session',      'session_id'),
    )

    # PrimaryKeyConstraint로 복합 PK 정의하므로 primary_key=True 제거,
    # autoincrement는 BigInteger + AUTO_INCREMENT DDL로 MySQL이 유지함.
    id               = Column(BigInteger, autoincrement=True, nullable=False)
    # FK 제거 — 파티션 테이블에 FK 불가 (cross-schema 패턴과 동일하게 처리)
    user_id          = Column(BinaryUUID, nullable=False,
                              comment='user.id 참조 (파티션 테이블 FK 불가)')
    user_voca_id     = Column(Integer, nullable=False,
                              comment='user_voca.id 참조 (파티션 테이블 FK 불가)')
    voca_id          = Column(Integer, nullable=True,  comment='사전 DB 단어 참조 (cross-schema, FK 없음)')
    user_voca_book_id = Column(BinaryUUID, nullable=True,
                               comment='user_voca_book.id 참조 (파티션 테이블 FK 불가)')
    session_id       = Column(BinaryUUID, nullable=False, comment='user_study_session.id 참조 (FK 없음)')
    test_type        = Column(String(16), nullable=False, comment='test|exam|today|quick')
    question_type    = Column(String(32), nullable=False, comment='multipleChoice|multipleChoiceListening|fillInTheBlank|cardMatch|cardMatchListening')
    was_correct      = Column(Boolean, nullable=False)
    q_score          = Column(Integer,     nullable=False, comment='SM2 점수: 0/3/4/5')
    rating           = Column(Integer,     nullable=True,  comment='FSRS: 1=Again,2=Hard,3=Good,4=Easy (Phase 1.2부터 채움)')
    time_taken_ms    = Column(Integer, nullable=False)
    word_length      = Column(Integer,     nullable=True)
    state_before     = Column(TEXT, nullable=True, comment='FSRS state JSON (적용 전)')
    state_after      = Column(TEXT, nullable=True, comment='FSRS state JSON (적용 후)')
    created_at       = Column(DateTime, nullable=False, default=datetime.utcnow)

    # 관계 정의 (session_id에 FK가 없으므로 primaryjoin/foreign 명시)
    session = relationship(
        'UserStudySession',
        back_populates='logs',
        primaryjoin='foreign(UserStudyLog.session_id) == UserStudySession.id',
    )

    def __init__(self, user_id, user_voca_id, session_id, test_type, question_type,
                 was_correct, q_score, time_taken_ms,
                 voca_id=None, user_voca_book_id=None,
                 rating=None, word_length=None,
                 state_before=None, state_after=None):
        self.user_id           = user_id
        self.user_voca_id      = user_voca_id
        self.voca_id           = voca_id
        self.user_voca_book_id = user_voca_book_id
        self.session_id        = session_id
        self.test_type         = test_type
        self.question_type     = question_type
        self.was_correct       = was_correct
        self.q_score           = q_score
        self.rating            = rating
        self.time_taken_ms     = time_taken_ms
        self.word_length       = word_length
        self.state_before      = state_before
        self.state_after       = state_after

### 학습 로그 ###


### 문제 유형별 사용자 정답률 집계 (Phase 2.1) ###

class UserQuestionTypeStat(db.Model):
    """문제 유형별 사용자 정답률 집계 (Phase 2.1)."""
    __tablename__ = 'user_question_type_stat'
    __table_args__ = (
        UniqueConstraint('user_id', 'question_type', name='uq_user_qtype'),
    )

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(BinaryUUID, ForeignKey('user.id'), nullable=False, index=True)
    question_type    = Column(String(32), nullable=False,
                              comment='multipleChoice|multipleChoiceListening|fillInTheBlank|cardMatch|cardMatchListening')
    total_count      = Column(Integer, nullable=False, default=0)
    correct_count    = Column(Integer, nullable=False, default=0)
    avg_time_taken_ms = Column(Integer, nullable=False, default=0,
                               comment='EWMA: new_avg = 0.9*old + 0.1*new')
    last_30d_correct_rate = Column(Float, nullable=True,
                                   comment='배치(refresh_question_type_stats.py)로 갱신')
    updated_at       = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __init__(self, user_id, question_type, total_count=0, correct_count=0,
                 avg_time_taken_ms=0, last_30d_correct_rate=None):
        self.user_id               = user_id
        self.question_type         = question_type
        self.total_count           = total_count
        self.correct_count         = correct_count
        self.avg_time_taken_ms     = avg_time_taken_ms
        self.last_30d_correct_rate = last_30d_correct_rate

### 문제 유형별 사용자 정답률 집계 ###


### 온보딩 행동 기반 미션 완료 기록 (사용자 DB) ###
class UserOnboardingMission(db.Model):
    """온보딩 5단계 미션(ai_test/make_book/buy_book/search_word/focus_study) 완료 기록.

    '완료 세션 수' 방식 대신 미션별 명시적 완료 시점을 기록한다(멱등, 1인당 1회).
    reward_gem 지급 및 feature 해금 판정은 이 테이블의 존재 여부로 결정한다.
    """
    __tablename__ = 'user_onboarding_mission'
    __table_args__ = (
        UniqueConstraint('user_id', 'mission_key', name='uq_user_onboarding_mission'),
    )

    id           = Column(Integer, primary_key=True, autoincrement=True)
    user_id      = Column(BinaryUUID, ForeignKey('user.id'), nullable=False, index=True)
    mission_key  = Column(String(32), nullable=False, comment='ai_test|make_book|buy_book|search_word|focus_study')
    completed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, user_id, mission_key, completed_at=None):
        self.user_id = user_id
        self.mission_key = mission_key
        self.completed_at = completed_at or datetime.utcnow()
### 온보딩 행동 기반 미션 완료 기록 ###


### 사전 메타 (dict_sync.py가 현재 적용된 dump의 sha256 저장) ###
class DictMeta(db.Model):
    __tablename__ = 'dict_meta'
    __bind_key__ = 'dict'
    key = Column(String(64), primary_key=True)   # 'current_dump_sha256', 'current_dump_version' 등
    value = Column(String(255), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
