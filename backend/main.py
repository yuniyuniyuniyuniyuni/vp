# backend/main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio 
import time
import httpx 
from jose import jwt, JWTError 
from supabase import create_client, Client # [추가]
import os
from dotenv import load_dotenv

# [수정] reset_ai_engine는 임포트에서 제거
from ai_monitor import generate_frames, get_current_stats, ai_engine_instance 

load_dotenv() 
# --- [추가] Supabase 설정 ---
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_KEY") # DB 접근용 (Admin)
try:
    if url is None or key is None:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")
    supabase: Client = create_client(url, key)
    print("Supabase client initialized.")
except Exception as e:
    print(f"Error initializing Supabase: {e}")
    supabase = None
# --- [추가 완료] ---

SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET") 
ALGORITHM = "HS256" # (Supabase 기본값, 확인 필요)

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

@app.websocket("/ws_stats")
async def websocket_stats_endpoint(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket 연결.
    토큰(Supabase JWT)이 있으면(로그인 사용자) DB에서 로드/저장.
    토큰이 없으면(비로그인 사용자) DB 연동 없이 세션만 운영.
    """
    
    user_email = None # 기본값 None (비로그인)
    
    # 1. 토큰 검증 (토큰이 제공된 경우에만)
    if token:
        if supabase is None:
            await websocket.close(code=1011, reason="Supabase client not initialized")
            return
        if SUPABASE_JWT_SECRET is None:
            print("ERROR: SUPABASE_JWT_SECRET not set in .env")
            await websocket.close(code=1011, reason="JWT secret key not configured")
            return
            
        try:
            # [수정] Supabase JWT Secret으로 토큰 검증
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=[ALGORITHM], options={"verify_aud": False}) # (aud 검증은 일단 비활성화)
            # [수정] Supabase 토큰은 'email' 클레임에 이메일이 있음
            user_email: str = payload.get("email") 
            if user_email is None:
                raise JWTError("User email not in token payload")
        except JWTError as e:
            print(f"Invalid Supabase token: {e}")
            await websocket.close(code=1008, reason="Invalid token")
            return
    
    # 2. WebSocket 연결 수락 (비로그인 사용자도 수락)
    await websocket.accept()

    # 3. 사용자 데이터 불러오기 (로그인 사용자) 또는 리셋 (비로그인 사용자)
    if ai_engine_instance is None:
        await websocket.close(code=1011, reason="AI Engine not initialized")
        return
        
    try:
        if user_email:
            # --- 로그인 사용자 ---
            print(f"WebSocket client connected: {user_email}")
            
            # [수정] 테이블명 "user_stats" (새로 만드셨다고 가정)
            response = supabase.table("user_stats").select("*").eq("user_email", user_email).single().execute()
            
            # [수정] Supabase Auth로 로그인했으나 'user_stats' 테이블에 데이터가 없는 경우
            if response.data is None:
                print(f"No stats row found for {user_email}. Creating one.")
                # 'user_stats'에 기본 행 삽입 (이 로직이 /auth/google을 대체)
                supabase.table("user_stats").upsert(
                    {"user_email": user_email, "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, 
                    on_conflict="user_email" 
                ).execute()
                ai_engine_instance.load_user_stats({}) # 빈 데이터로 시작
            else:
                ai_engine_instance.load_user_stats(response.data)
                print(f"Stats loaded for user: {user_email}")
        else:
            # --- 비로그인 사용자 ---
            print("WebSocket client connected: ANONYMOUS")
            ai_engine_instance.load_user_stats({}) # 통계 리셋
            
    except Exception as e:
        print(f"Error loading stats or resetting: {e}")
        if user_email: 
             ai_engine_instance.load_user_stats({})
        
    # 4. 실시간 통계 전송 루프 (기존과 동일)
    try:
        while True:
            if ai_engine_instance is None:
                 await asyncio.sleep(1.0)
                 continue
                 
            stats = get_current_stats()
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
            
    # 5. 연결 종료 (로그인 사용자만 데이터 저장)
    except WebSocketDisconnect:
        if user_email:
            # --- 로그인 사용자 ---
            print(f"WebSocket client disconnected: {user_email}")
            if ai_engine_instance:
                try:
                    ai_engine_instance.commit_running_time()
                    final_stats = ai_engine_instance.get_user_stats_for_db()
                    
                    # [수정] 테이블명 "user_stats"
                    supabase.table("user_stats").update(final_stats).eq("user_email", user_email).execute()
                    print(f"Stats saved to Supabase for user: {user_email}")
                except Exception as e:
                    print(f"Error saving stats to Supabase: {e}")
        else:
            # --- 비로그인 사용자 ---
            print("Anonymous client disconnected. Stats not saved.")
        
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1011)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)