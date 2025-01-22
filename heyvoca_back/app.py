from flask import Flask
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/')
def index():
  return "Hello, World"


@app.route('/print')
def print_hello():
  print("Hello, World!")

  return ""

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 