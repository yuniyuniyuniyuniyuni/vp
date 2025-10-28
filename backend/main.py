# backend/main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio 
import time
from jose import jwt, JWTError 
from supabase import create_client, Client # [추가]
import os
from dotenv import load_dotenv
from ai_monitor import generate_frames, get_current_stats, ai_engine_instance 

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
    
    await websocket.accept()

    if ai_engine_instance is None:
        await websocket.close(code=1011, reason="AI Engine not initialized")
        return
        
    try:
        if user_email:
            print(f"WebSocket client connected: {user_email}")
            response = supabase.table("user_stats").select("*").eq("user_email", user_email).execute()
            if not response.data: 
                print(f"No stats row found for {user_email}. Creating one.")
                supabase.table("user_stats").upsert(
                    {
                     "user_email": user_email,
                     "user_name": user_name, 
                     "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, 
                    on_conflict="user_email"
                ).execute()
                ai_engine_instance.load_user_stats({})
            else:
                ai_engine_instance.load_user_stats(response.data[0]) # type: ignore
                print(f"Stats loaded for user: {user_email}")
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
    except WebSocketDisconnect:
        if user_email:
            print(f"WebSocket client disconnected: {user_email}")
            if ai_engine_instance:
                try:
                    ai_engine_instance.commit_running_time()
                    final_stats = ai_engine_instance.get_user_stats_for_db()
                    supabase.table("user_stats").update(final_stats).eq("user_email", user_email).execute()
                    print(f"Stats saved to Supabase for user: {user_email}")
                except Exception as e:
                    print(f"Error saving stats to Supabase: {e}")
        else:
            print("Anonymous client disconnected. Stats not saved.")
        
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1011)
        
@app.get("/ranking/top10")
async def get_top10_ranking():

    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase client not initialized")
    try:
        response = supabase.table("user_stats") \
                         .select("user_name, total_study_seconds") \
                         .order("total_study_seconds", desc=True) \
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