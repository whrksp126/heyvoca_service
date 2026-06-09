from app import db

from sqlalchemy import ForeignKey, Enum, UniqueConstraint, Index, PrimaryKeyConstraint
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

    def __init__(self, word, pronunciation=None):
        self.word = word
        self.pronunciation = pronunciation

    def __repr__(self):
        return f"<Voca(word='{self.word}', pronunciation='{self.pronunciation}')>"
# 단어 뜻
class VocaMeaning(db.Model):
    __tablename__ = 'voca_meaning'
    __bind_key__ = 'dict'
    id = Column(Integer, primary_key=True)
    meaning = Column(String(255), nullable=False)

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
    level = Column(String(50), nullable=True)
    level_id = Column(Integer, nullable=False)
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
    today_study_complete = Column(Boolean, nullable=False, default=False)

    def __init__(self, user_id, attendence_date, today_study_complete):
        self.user_id = user_id
        self.attendence_date = attendence_date
        self.today_study_complete = today_study_complete


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
    id = Column(Integer, primary_key=True)
    voca_id = Column(Integer, ForeignKey('voca.id'))
    book_id = Column(Integer, ForeignKey('admin_voca_book.id'))
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

    # 관계 정의 (session_id에 FK가 없으므로 primaryjoin/foreign 명시)
    logs = relationship(
        'UserStudyLog',
        back_populates='session',
        cascade='all, delete-orphan',
        primaryjoin='UserStudySession.id == foreign(UserStudyLog.session_id)',
    )

    def __init__(self, user_id, test_type, book_ids=None, question_count=0, correct_count=0, finished_at=None):
        self.user_id        = user_id
        self.test_type      = test_type
        self.book_ids       = book_ids
        self.question_count = question_count
        self.correct_count  = correct_count
        self.finished_at    = finished_at


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


### 사전 메타 (dict_sync.py가 현재 적용된 dump의 sha256 저장) ###
class DictMeta(db.Model):
    __tablename__ = 'dict_meta'
    __bind_key__ = 'dict'
    key = Column(String(64), primary_key=True)   # 'current_dump_sha256', 'current_dump_version' 등
    value = Column(String(255), nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)