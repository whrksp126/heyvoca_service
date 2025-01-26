from flask import Blueprint

login_bp = Blueprint('login', __name__, url_prefix='/login')
search_bp = Blueprint('search', __name__, url_prefix='/search')
tts_bp = Blueprint('tts', __name__, url_prefix='/tts')
fcm_bp = Blueprint('fcm', __name__, url_prefix='/fcm')
drive_bp = Blueprint('drive', __name__, url_prefix='/drive')
mainpage_bp = Blueprint('mainpage', __name__, url_prefix='/mainpage')
check_bp = Blueprint('check', __name__, url_prefix='/check')


from app.routes import login
from app.routes import search
from app.routes import tts
from app.routes import fcm
from app.routes import drive
from app.routes import mainpage
from app.routes import check