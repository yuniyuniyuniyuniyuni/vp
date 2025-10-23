# backend/main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio # WebSocket을 위해 추가
import time     # WebSocket을 위해 추가

# 1. get_current_stats 함수를 추가로 임포트합니다.
from ai_monitor import generate_frames, get_current_stats

app = FastAPI()

# --- CORS 미들웨어 (수정 없음) ---
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
# --- CORS 완료 ---


@app.get("/")
def read_root():
    return {"Hello": "NODOZE AI Backend"}

@app.get("/video_feed")
def video_feed():
    """
    OpenCV 비디오 프레임을 스트리밍합니다. (수정 없음)
    이 엔드포인트가 호출되면 ai_monitor.generate_frames()가
    별도 스레드에서 실행되며 전역 변수를 업데이트하기 시작합니다.
    """
    return StreamingResponse(
        generate_frames(), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# --- [새로 추가] ---
@app.websocket("/ws_stats")
async def websocket_stats_endpoint(websocket: WebSocket):
    """
    WebSocket 연결을 처리하고 1초마다
    AI 모니터의 통계(시간, 상태)를 JSON으로 전송합니다.
    """
    await websocket.accept()
    print("WebSocket client connected")
    try:
        while True:
            # 1. ai_monitor의 전역 변수에서 현재 상태를 읽어옵니다.
            stats = get_current_stats()
            
            # 2. 타이머가 "Studying" 상태일 때 실시간 시간을 계산합니다.
            display_time_sec = stats["total_study_time"]
            if stats["is_timer_running"] and stats["study_session_start_time"]:
                # 누적 시간 + (현재 시간 - 세션 시작 시간)
                display_time_sec += (time.time() - stats["study_session_start_time"])
            
            # 3. 시간을 HH:MM:SS 형식으로 포맷팅합니다.
            hours = int(display_time_sec // 3600)
            minutes = int((display_time_sec % 3600) // 60)
            seconds = int(display_time_sec % 60)
            timer_text = f"{hours:02}:{minutes:02}:{seconds:02}"
            
            # 4. 상태 텍스트를 가져옵니다.
            status_text = stats["current_status"]
            
            # 5. 클라이언트에 JSON 데이터 전송
            await websocket.send_json({
                "time": timer_text,
                "status": status_text,
                "counts": stats["counts"]  # 'counts' 객체를 통째로 전송
            })
            
            # 6. 1초 대기
            await asyncio.sleep(1.0)
            
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1011) # 서버 내부 오류
# --- [추가 완료] ---


if __name__ == "__main__":
    print("Run the server using: uvicorn main:app --host 0.0.0.0 --port 8000")