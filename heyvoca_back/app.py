from app import create_app, db
from flask_login import LoginManager
from flask_cors import CORS

app = create_app()
if __name__ == '__main__':
  app.run(host='0.0.0.0', port=5000, debug=True)