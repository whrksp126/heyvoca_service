from app import db

from sqlalchemy import ForeignKey, Enum, UniqueConstraint, Index
from sqlalchemy.schema import Column
from sqlalchemy.types import String, Integer, Date, DateTime, Boolean, Text, BigInteger, Date, TEXT

from sqlalchemy.dialects.mysql import BINARY
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import relationship

from uuid import uuid4, UUID
from datetime import datetime, timedelta
import enum


class BinaryUUID(TypeDecorator):
    impl = BINARY(16)
    cache_ok = True  # 캐시 키 사용을 허용하여 경고 제거

    def process_bind_param(self, value, dialect=None):
        if not value:
            return None
        if isinstance(value, UUID):
            return value.bytes
        else:
            raise ValueError('value {} is not a valid UUID'.format(value))

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
    google_id = Column(String(128), nullable=False)
    name = Column(String(32), nullable=False)
    username = Column(String(36), nullable=True, default=None)
    phone = Column(String(16), nullable=True)
    code = Column(String(36), nullable=False)
    xp = Column(Integer, nullable=False, default=0)
    book_cnt = Column(Integer, nullable=False, default=3)
    gem_cnt = Column(Integer, nullable=False, default=0)
    set_goal_cnt = Column(Integer, nullable=False, default=3)
    refresh_token = Column(String(512), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_logged_at = Column(DateTime, nullable=True, default=None)

    def __init__(self, level_id, email, google_id, username, name, phone,
                last_logged_at, refresh_token, code,
                 book_cnt, gem_cnt, set_goal_cnt):
        self.level_id = level_id
        self.email = email
        self.google_id = google_id
        self.username = username
        self.name = name
        self.phone = phone
        self.refresh_token = refresh_token
        self.code = code
        self.book_cnt = book_cnt
        self.gem_cnt = gem_cnt
        self.set_goal_cnt = set_goal_cnt
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

    def __init__(self, user_id, token, is_message_allowed):
        self.user_id = user_id
        self.token = token
        self.is_message_allowed = is_message_allowed

##############
# 기본 테이블 #
##############

# 단어장
class VocaBook(db.Model):
    __tablename__ = 'voca_book'
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
    id = Column(Integer, primary_key=True)
    word = Column(String(255), nullable=False)
    pronunciation = Column(String(100), nullable=True)
    verb_forms = Column(Text, nullable=True)

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
    id = Column(Integer, primary_key=True)
    meaning = Column(String(255), nullable=False)

    # 관계 정의
    voca_meanings = relationship("VocaMeaningMap", back_populates="meaning")


# 단어 예문
class VocaExample(db.Model):
    __tablename__ = 'voca_example'
    id = Column(Integer, primary_key=True)
    exam_en = Column(Text, nullable=True)
    exam_ko = Column(Text, nullable=True)

    # 관계 정의
    voca_examples = relationship("VocaExampleMap", back_populates="example")


# 서점
class Bookstore(db.Model):
    __tablename__ = 'bookstore'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    downloads = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False)
    color = Column(String(255), nullable=True)
    hide = Column(String(1), nullable=False)
    book_id = Column(Integer, ForeignKey('voca_book.id'), nullable=False)
    # level_id = Column(Integer, ForeignKey('level.id'), nullable=False)

    # 관계 정의
    voca_book = relationship("VocaBook")


##############
# 관계 테이블 #
##############

# 단어장-단어
class VocaBookMap(db.Model):
    __tablename__ = 'voca_book_map'
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)
    book_id = Column(Integer, ForeignKey('voca_book.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)

    # 관계 정의
    voca = relationship("Voca", back_populates="voca_books")
    voca_book = relationship("VocaBook", back_populates="voca_books")


# 단어뜻-단어
class VocaMeaningMap(db.Model):
    __tablename__ = 'voca_meaning_map'
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)
    meaning_id = Column(Integer, ForeignKey('voca_meaning.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)

    # 관계 정의
    voca = relationship("Voca", back_populates="voca_meanings")
    meaning = relationship("VocaMeaning", back_populates="voca_meanings")


# 단어예문-단어
class VocaExampleMap(db.Model):
    __tablename__ = 'voca_example_map'
    voca_id = Column(Integer, ForeignKey('voca.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)
    example_id = Column(Integer, ForeignKey('voca_example.id', ondelete='CASCADE', onupdate='NO ACTION'), primary_key=True)

    # 관계 정의
    voca = relationship("Voca", back_populates="voca_examples")
    example = relationship("VocaExample", back_populates="voca_examples")


class DailySentence(db.Model):
    __tablename__ = 'daily_sentence'
    date = Column(Date, nullable=False, primary_key=True)
    sentence = Column(String(200), nullable=False, primary_key=True)
    meaning = Column(String(200), nullable=False)


class UserVocaBook(db.Model):
    __tablename__ = 'user_voca_book'
    id = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    vocabook_id = Column(Integer, ForeignKey('voca_book.id'), nullable=True)
    color = Column(String(256), nullable=False)
    name = Column(String(36), nullable=False)
    total_word_cnt = Column(Integer, nullable=False, default=0)
    memorized_word_cnt = Column(Integer, nullable=False, default=0)
    voca_list = Column(TEXT, nullable=True, default=None)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=None)

    def __init__(self, user_id, vocabook_id, color, name, total_word_cnt, memorized_word_cnt, voca_list, updated_at):
        self.user_id = user_id
        self.vocabook_id = vocabook_id
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

    def __init__(self, user_id, attendence_check, today_study_complete):
        self.user_id = user_id
        self.attendence_check = attendence_check
        self.today_study_complete = today_study_complete


class UserRecentStudy(db.Model):
    __tablename__ = 'user_recent_study'
    id = Column(BinaryUUID, primary_key=True, nullable=False, default=uuid4)
    user_id = Column(BinaryUUID, ForeignKey('user.id'), nullable=False)
    study_data = Column(TEXT, nullable=True)
    status = Column(String(36), nullable=True)
    progress_index = Column(Integer, nullable=True)
    type = Column(String(64), nullable=True)
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
    description = Column(String(512), nullable=True)
    badge_img = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, type_id, level, goal, reward_count, description, badge_img):
        self.type_id = type_id
        self.level = level
        self.goal = goal
        self.reward_count = reward_count
        self.description = description
        self.badge_img = badge_img



