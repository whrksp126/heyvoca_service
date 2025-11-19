from flask import Blueprint

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')
search_bp = Blueprint('search', __name__, url_prefix='/search')
tts_bp = Blueprint('tts', __name__, url_prefix='/tts')
fcm_bp = Blueprint('fcm', __name__, url_prefix='/fcm')
drive_bp = Blueprint('drive', __name__, url_prefix='/drive')
mainpage_bp = Blueprint('mainpage', __name__, url_prefix='/mainpage')
version_bp = Blueprint('version', __name__, url_prefix='/version')
user_voca_book_bp = Blueprint('user_voca_book', __name__, url_prefix='/user_voca_book')
purchase_bp = Blueprint('purchase', __name__, url_prefix='/purchase')
ocr_bp = Blueprint('ocr', __name__, url_prefix='/ocr')

from app.routes import auth
from app.routes import search
from app.routes import tts
from app.routes import fcm
from app.routes import drive
from app.routes import mainpage
from app.routes import version
from app.routes import user_voca_book
from app.routes import purchase
from app.routes import ocr