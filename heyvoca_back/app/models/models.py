from app import db

from sqlalchemy import ForeignKey, Enum, UniqueConstraint, Index
from sqlalchemy.schema import Column
from sqlalchemy.types import String, Integer, Date, DateTime, Boolean, Text, BigInteger, Date

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


class User(db.Model):
    __tablename__ = 'user'
    id = Column(BinaryUUID, primary_key=True, default=uuid4)
    email = Column(String(128), nullable=False) 
    google_id = Column(String(128), nullable=False)
    name = Column(String(32), nullable=False)
    phone = Column(String(16), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_logged_at = Column(DateTime, nullable=True, default=None)
    refresh_token = Column(String(512), nullable=True)

    def __init__(self, email, google_id, name, phone, refresh_token=None):
        self.email = email
        self.google_id = google_id
        self.name = name
        self.phone = phone
        self.refresh_token = refresh_token
    
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