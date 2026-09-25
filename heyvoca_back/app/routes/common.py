from flask import Blueprint, jsonify, request, g
from datetime import datetime
import requests
import json
import base64
import os
from uuid import UUID
from app.routes import purchase_bp
from app.utils.jwt_utils import jwt_required
from app.models.models import User, DailySentence, UserGoals, CheckIn, Goals, GoalType, UserRecentStudy, RecentStudyType, Voca, VocaMeaning, VocaExample, VocaBookMap, VocaMeaningMap, VocaExampleMap, UserVocaBook, Bookstore, Product, Purchase, GemLog, GemReason
from app import db


def register_gem_log(user_id, amount, reason, description,
                     source_type, source_id, balance_after):
    """GemLog 한 줄 추가 — **커밋하지 않는다**(호출부가 자기 트랜잭션 끝에서 커밋).

    예전에는 내부에서 커밋해 보석 변경과 원장이 트랜잭션 둘로 쪼개졌다. 잔액을 함께 바꾸는
    경로는 `app.utils.gem.change_gem`(잠금 + 잔액 검사 + 원장)을 쓴다. 이 함수는 호환용이다.
    """
    from app.utils.gem import add_gem_log
    add_gem_log(user_id, amount, reason, description,
                source_type=source_type, source_id=source_id,
                balance_after=balance_after)
