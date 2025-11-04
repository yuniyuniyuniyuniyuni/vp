from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio 
import time
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError 
from supabase import create_client, Client
import os
from dotenv import load_dotenv
from ai_monitor import generate_frames, get_current_stats, ai_engine_instance
import cv2

load_dotenv() 

url: str = os.environ.get("SUPABASE_URL")                           # type: ignore
key: str = os.environ.get("SUPABASE_SERVICE_KEY")                   # type: ignore 
try:
    if url is None or key is None:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")
    supabase: Client = create_client(url, key)
    print("Supabase client initialized.")
except Exception as e:
    print(f"Error initializing Supabase: {e}")  
    supabase = None                                                 # type: ignore

SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET")    # type: ignore
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

@app.get("/")
def read_root():
    return {"Hello": "NODOZE AI Backend"}

@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        generate_frames(), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.websocket("/ws_stats")
async def websocket_stats_endpoint(websocket: WebSocket, token: str = Query(None)):

    user_email = None                                               # type: ignore
    user_name = "Ananymous"                                           # type: ignore
    if token:
        if supabase is None:
            await websocket.close(code=1011, reason="Supabase client not initialized")
            return
        if SUPABASE_JWT_SECRET is None:
            print("ERROR: SUPABASE_JWT_SECRET not set in .env")
            await websocket.close(code=1011, reason="JWT secret key not configured")
            return
            
        try:
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=[ALGORITHM], options={"verify_aud": False})
            user_email: str = payload.get("email")                   # type: ignore   
            user_metadata = payload.get("user_metadata", {})
            user_name: str = user_metadata.get("name", user_email.split('@')[0])    
            if user_email is None:
                raise JWTError("User email not in token payload")
        except JWTError as e:
            print(f"Invalid Supabase token: {e}")
            await websocket.close(code=1008, reason="Invalid token")
            return
    
    kst_timezone = timezone(timedelta(hours=9))

    now_kst = datetime.now(kst_timezone)
    
    if now_kst.hour < 6:
        logical_date_obj = now_kst.date() - timedelta(days=1)
    else:
        logical_date_obj = now_kst.date()

    study_date_key = logical_date_obj.isoformat()
    await websocket.accept()

    if ai_engine_instance is None:
        await websocket.close(code=1011, reason="AI Engine not initialized")
        return
        
    try:
        if user_email:
            print(f"WebSocket client connected: {user_email}")
            
            try:
                supabase.table("user_stats").upsert(
                    {
                        "user_email": user_email, 
                        "user_name": user_name,
                        "total_study_seconds": 0, 
                        "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                    },
                    on_conflict="user_email",
                    ignore_duplicates=True 
                ).execute()
                print(f"Ensured user exists in user_stats: {user_email}")
            except Exception as e:
                print(f"CRITICAL Error ensuring user in user_stats: {e}")
                await websocket.close(code=1011, reason="Failed to initialize user stats entry")
                return
            
            today_date_gmt = time.strftime('%Y-%m-%d', time.gmtime())
            response = supabase.table("daily_user_stats") \
                             .select("*") \
                             .eq("user_email", user_email) \
                             .eq("date", study_date_key) \
                             .execute()
                             
            if not response.data:
                print(f"No daily stats found for {user_email} on {study_date_key}. Starting fresh.")
                ai_engine_instance.load_user_stats({})
            else:
                ai_engine_instance.load_user_stats(response.data[0]) # type: ignore
                print(f"Daily stats loaded for user: {user_email} on {study_date_key}")
        else:
            print("WebSocket client connected: ANONYMOUS")
            ai_engine_instance.load_user_stats({})
            
    except Exception as e:
        print(f"CRITICAL Error loading stats: {e}")
        ai_engine_instance.load_user_stats({})
    try:
        while True:
            if ai_engine_instance is None:
                 await asyncio.sleep(1.0)
                 continue
                 
            stats_data = get_current_stats()
            display_time_sec = stats_data["total_study_seconds"]
            
            hours = int(display_time_sec // 3600)
            minutes = int((display_time_sec % 3600) // 60)
            seconds = int(display_time_sec % 60)
            timer_text = f"{hours:02}:{minutes:02}:{seconds:02}"
            status_text = stats_data["current_status"]

            await websocket.send_json({
                "time": timer_text,
                "status": status_text,
                "stats": stats_data["stats"] 
            })
            
            await asyncio.sleep(1.0)
            
    except WebSocketDisconnect:
        if user_email:
            print(f"WebSocket client disconnected: {user_email}")
            if ai_engine_instance and supabase:
                try:
                    ai_engine_instance.commit_all_running_timers()
                    final_daily_stats, session_delta_stats = ai_engine_instance.get_final_stats()
                    
                    final_daily_stats["user_email"] = user_email
                    final_daily_stats["user_name"] = user_name
                    final_daily_stats["date"] = study_date_key

                    supabase.table("daily_user_stats").upsert(
                        final_daily_stats, 
                        on_conflict="user_email,date" 
                    ).execute()
                    print(f"Daily stats (total) saved to Supabase for user: {user_email}")

                    if session_delta_stats["study_seconds"] > 0:
                        
                        rpc_payload = {
                            "p_user_email": user_email,
                            "p_user_name": user_name,
                            "p_study_seconds_delta": session_delta_stats["study_seconds"]
                        }

                        supabase.rpc("increment_user_stats", rpc_payload).execute()
                        print(f"Total stats (delta) incremented for user: {user_email}")
                    else:
                        print(f"No study time in this session. Total stats not updated.")

                except Exception as e:
                    print(f"Error saving stats to Supabase: {e}")
        else:
            print("Anonymous client disconnected. Stats not saved.")

@app.post("/api/register-face")
async def register_face():
    """사용자 얼굴 등록"""
    if ai_engine_instance is None:
        raise HTTPException(status_code=503, detail="AI Engine not initialized")
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise HTTPException(status_code=500, detail="카메라를 열 수 없습니다.")
    
    success, frame = cap.read()
    cap.release()
    
    if not success:
        raise HTTPException(status_code=500, detail="프레임을 가져올 수 없습니다.")
    
    frame = cv2.flip(frame, 1)
    success, message = ai_engine_instance.register_user_face(frame)
    
    return {"success": success, "message": message}

@app.get("/api/check-face-registered")
async def check_face_registered():
    """얼굴 등록 여부 확인"""
    if ai_engine_instance is None:
        return {"registered": False}
    return {"registered": ai_engine_instance.is_face_registered}

@app.delete("/api/delete-face")
async def delete_registered_face():
    """등록된 얼굴 삭제"""
    if ai_engine_instance is None:
        raise HTTPException(status_code=503, detail="AI Engine not initialized")
    
    success, message = ai_engine_instance.delete_registered_face()
    return {"success": success, "message": message}
        
@app.get("/ranking/top10")
async def get_top10_ranking():

    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase client not initialized")
    kst_timezone = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst_timezone)
    
    if now_kst.hour < 6:
        logical_date_obj = now_kst.date() - timedelta(days=1)
    else:
        logical_date_obj = now_kst.date()

    study_date_key = logical_date_obj.isoformat()
    print(f"Fetching ranking for date: {study_date_key}")
    try:
        response = supabase.table("daily_user_stats") \
                         .select("user_name, user_email, daily_study_seconds") \
                         .eq("date", study_date_key) \
                         .order("daily_study_seconds", desc=True) \
                         .limit(10) \
                         .execute()
        
        if not response.data:
            return []
        return response.data
    
    except Exception as e:
        print(f"Error fetching ranking: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch ranking: {e}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)