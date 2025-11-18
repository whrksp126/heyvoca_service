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
    gem_log = GemLog(
        user_id=user_id,
        amount=amount,
        reason=reason.value,
        description=description,
        source_type=source_type,
        source_id=source_id,
        balance_after=balance_after,
    )
    db.session.add(gem_log)
    db.session.commit()