from flask import Blueprint

login_bp = Blueprint('login', __name__, url_prefix='/login')
search_bp = Blueprint('search', __name__, url_prefix='/search')
tts_bp = Blueprint('tts', __name__, url_prefix='/tts')
fcm_bp = Blueprint('fcm', __name__, url_prefix='/fcm')
drive_bp = Blueprint('drive', __name__, url_prefix='/drive')
mainpage_bp = Blueprint('mainpage', __name__, url_prefix='/mainpage')
check_bp = Blueprint('check', __name__, url_prefix='/check')
user_voca_book_bp = Blueprint('user_voca_book', __name__, url_prefix='/user_voca_book')

from app.routes import login
from app.routes import search
from app.routes import tts
from app.routes import fcm
from app.routes import drive
from app.routes import mainpage
from app.routes import check
from app.routes import user_voca_book