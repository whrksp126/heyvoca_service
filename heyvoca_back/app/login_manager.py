# 사용자 로드 함수
def load_user(user_id):
    from app.models.models import db, User
    
    print("@#$load_user,user_id,",user_id)
    user_item = db.session.query(User).filter(User.id == user_id).first()
    print("###user_item")
    return user_item

# 로그인이 되어있지 않은 경우
def unauthorized_callback():
    print("@#$unauthorized")
    print('로그인이 되어있지 않은 경우')
    return "로그인이 필요합니다.", 401
