# backend/main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio 
import time
import httpx 
from jose import jwt, JWTError 
from google.oauth2 import id_token 
from google.auth.transport import requests as google_requests 
from supabase import create_client, Client # [추가]
import os
from dotenv import load_dotenv

# [수정] reset_ai_engine는 임포트에서 제거
from ai_monitor import generate_frames, get_current_stats, ai_engine_instance 

load_dotenv() 
# --- [추가] Supabase 설정 ---
# !!! 실제 Supabase 프로젝트 URL과 service_role 키로 변경하세요 !!!
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_KEY")
try:
    supabase: Client = create_client(url, key)
    print("Supabase client initialized.")
except Exception as e:
    print(f"Error initializing Supabase: {e}")
    supabase = None
# --- [추가 완료] ---


# --- [수정] Google OAuth 및 JWT 설정 ---
# !!! 실제 Google Cloud 값으로 변경하세요 !!!
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = "http://localhost:5173" 
JWT_SECRET_KEY = "your-very-secret-key-please-change-it"
ALGORITHM = "HS256"

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- 자체 JWT(세션 토큰) 생성 함수 ---
def create_access_token(data: dict):
    to_encode = data.copy()
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- [수정] Google 로그인 처리 엔드포인트 ---
@app.post("/auth/google")
async def auth_google(data: dict = Body(...)):
    """
    프론트엔드에서 받은 authorization_code를 사용하여 Google 토큰을 교환하고,
    사용자 정보를 확인한 뒤 Supabase에 사용자를 생성/확인하고 자체 JWT를 발급합니다.
    """
    code = data.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code not provided")
    
    if supabase is None:
         raise HTTPException(status_code=500, detail="Supabase client not initialized")

    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI, 
        "grant_type": "authorization_code",
    }

    try:
        # 1. Google에 인증 코드를 보내고 ID 토큰을 받음
        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            token_response.raise_for_status() # 오류 발생 시 예외
            token_json = token_response.json()
            
        id_token_str = token_json.get("id_token")
        if not id_token_str:
            raise HTTPException(status_code=400, detail="ID token not found in response")

        # 2. Google ID 토큰을 검증하여 사용자 정보를 추출
        try:
            id_info = id_token.verify_oauth2_token(
                id_token_str, google_requests.Request(), GOOGLE_CLIENT_ID
            )
        except ValueError as e:
            raise HTTPException(status_code=401, detail=f"Invalid ID token: {e}")

        user_email = id_info.get("email")
        user_name = id_info.get("name")
        user_picture = id_info.get("picture")

        if not user_email:
            raise HTTPException(status_code=400, detail="Email not found in ID token")

        # 3. [수정] Supabase에 사용자 정보 Upsert
        # user_stats 테이블에 사용자가 없으면 새로 생성 (기본값 사용)
        # on_conflict="user_email" -> 1단계 SQL에서 user_email을 PRIMARY KEY로 설정했어야 함
        try:
            supabase.table("user_stats").upsert(
                {"user_email": user_email, "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, 
                on_conflict="user_email" 
            ).execute()
            print(f"User upserted to Supabase: {user_email}")
        except Exception as e:
            print(f"Supabase upsert error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to upsert user in Supabase: {e}")
        
        # 4. 우리 서버 고유의 세션 토큰 (JWT) 생성
        app_access_token = create_access_token(
            data={"sub": user_email, "name": user_name, "picture": user_picture}
        )

        return {
            "access_token": app_access_token, # 우리 앱 전용 토큰
            "token_type": "bearer",
            "user": {
                "name": user_name,
                "email": user_email,
                "picture": user_picture
            }
        }

    except httpx.HTTPStatusError as e:
        print(f"Error exchanging code: {e.response.text}")
        raise HTTPException(status_code=400, detail=f"Failed to exchange code: {e.response.text}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {e}")


@app.get("/")
def read_root():
    return {"Hello": "NODOZE AI Backend"}

@app.get("/video_feed")
def video_feed():
    # (보안 강화)
    # 추후 이 엔드포인트도 토큰 검증 로직이 필요할 수 있습니다.
    # (예: /video_feed?token=OUR_APP_TOKEN)
    return StreamingResponse(
        generate_frames(), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# --- [수정] /ws_stats 웹소켓 엔드포인트 ---
@app.websocket("/ws_stats")
async def websocket_stats_endpoint(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket 연결 시 토큰을 검증하고, Supabase에서 사용자 통계를 불러옵니다.
    연결이 끊어지면 현재 통계를 Supabase에 저장합니다.
    """
    
    # 1. 토큰 검증
    if token is None:
        await websocket.close(code=1008, reason="Token not provided")
        return
        
    if supabase is None:
        await websocket.close(code=1011, reason="Supabase client not initialized")
        return

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_email: str = payload.get("sub")
        if user_email is None:
            raise JWTError("User email (sub) not in token")
    except JWTError:
        await websocket.close(code=1008, reason="Invalid token")
        return

    await websocket.accept()
    print(f"WebSocket client connected: {user_email}")
    
    # 2. Supabase에서 사용자 데이터 불러오기
    try:
        # 1단계 SQL에서 user_email을 PRIMARY KEY로 설정했으므로 .single() 사용 가능
        data, count = supabase.table("user_stats").select("*").eq("user_email", user_email).single().execute()
        
        # data는 튜플의 첫 번째 요소, 실제 데이터는 data[1]에 있음 (execute()의 반환 방식)
        # (v2.x 기준) -> data = supabase.table(...).execute() 후 data.data 사용
        response = supabase.table("user_stats").select("*").eq("user_email", user_email).single().execute()
        
        if ai_engine_instance:
            ai_engine_instance.load_user_stats(response.data)
            print(f"Stats loaded for user: {user_email}")
        else:
             raise Exception("AI Engine instance is not available")
             
    except Exception as e:
        print(f"Error loading stats from Supabase (user might be new): {e}")
        if ai_engine_instance:
            ai_engine_instance.load_user_stats({}) # 빈 데이터로 엔진 초기화
        else:
            await websocket.close(code=1011, reason="AI Engine failed to load stats")
            return
    
    # 3. 실시간 통계 전송 루프
    try:
        while True:
            if ai_engine_instance is None:
                 await asyncio.sleep(1.0)
                 continue
                 
            stats = get_current_stats()
            
            # get_current_stats()에서 이미 실시간 시간을 계산해서 반환함
            display_time_sec = stats["total_study_seconds"]
            
            hours = int(display_time_sec // 3600)
            minutes = int((display_time_sec % 3600) // 60)
            seconds = int(display_time_sec % 60)
            timer_text = f"{hours:02}:{minutes:02}:{seconds:02}"
            status_text = stats["current_status"]

            await websocket.send_json({
                "time": timer_text,
                "status": status_text,
                "counts": stats["counts"] 
            })
            
            await asyncio.sleep(1.0)
            
    # 4. 연결 종료 시 Supabase에 데이터 저장
    except WebSocketDisconnect:
        print(f"WebSocket client disconnected: {user_email}")
        if ai_engine_instance:
            try:
                # DB에 저장하기 전, 현재 실행 중인 시간 확정
                ai_engine_instance.commit_running_time()
                # DB에 저장할 최종 통계 데이터 가져오기
                final_stats = ai_engine_instance.get_user_stats_for_db()
                
                supabase.table("user_stats").update(final_stats).eq("user_email", user_email).execute()
                print(f"Stats saved to Supabase for user: {user_email}")
            except Exception as e:
                print(f"Error saving stats to Supabase: {e}")
        
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1011)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)