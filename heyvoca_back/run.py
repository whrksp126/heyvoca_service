import os
from app import create_app

# Flask 앱 생성
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('FLASK_RUN_PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
