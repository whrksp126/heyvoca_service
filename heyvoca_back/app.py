import os
from app import create_app

app = create_app()
assert app, "Flask 앱 생성에 실패했습니다."

if __name__ == '__main__':
    port = int(os.getenv("FLASK_RUN_PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
