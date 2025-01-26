from app.routes import check_bp
from flask import render_template

@check_bp.route('/')
def temp():
    return render_template('check_test.html')