import os
from app import create_app, db
from flask_login import LoginManager
from flask_cors import CORS

app = create_app()
if __name__ == '__main__':
  port = int(os.getenv("FLASK_RUN_PORT", 5003))
  app.run(host='0.0.0.0', port=port, debug=False)
