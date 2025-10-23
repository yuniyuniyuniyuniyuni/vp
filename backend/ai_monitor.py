# backend/ai_monitor.py

import cv2
import mediapipe as mp
import math
import time
from ultralytics import YOLO

# --- [모듈 1: 졸음 감지] 유틸리티 함수 ---

def euclidean_distance(point1, point2):
    """두 점 사이의 유클리드 거리를 계산합니다."""
    return math.sqrt((point1.x - point2.x)**2 + (point1.y - point2.y)**2)

def get_ear(landmarks, eye_indices):
    """눈의 종횡비(EAR)를 계산합니다."""
    try:
        # 눈의 수직 거리
        v1 = euclidean_distance(landmarks[eye_indices[1]], landmarks[eye_indices[5]])
        v2 = euclidean_distance(landmarks[eye_indices[2]], landmarks[eye_indices[4]])
        # 눈의 수평 거리
        h = euclidean_distance(landmarks[eye_indices[0]], landmarks[eye_indices[3]])
        
        # EAR 계산
        ear = (v1 + v2) / (2.0 * h)
        return ear
    except:
        return 0.0 # 랜드마크 인식 실패 시

# --- [모듈 1: 졸음 감지] MediaPipe 초기화 및 설정 ---
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True, # 눈, 입술 랜드마크 정교화
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# 눈 랜드마크 인덱스
LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]

# 졸음 감지 설정
EAR_THRESHOLD = 0.20 # EAR 임계값
DROWSY_CONSEC_FRAMES = 48 # 약 2초 (24fps 기준)

# 졸음 감지용 변수
drowsy_counter = 0
is_drowsy = False


# --- [모듈 2: 핸드폰 감지] YOLO 초기화 및 설정 ---
try:
    model = YOLO('yolo12n.pt') # 'small' 모델 사용
except Exception as e:
    print(f"Error loading YOLO model: {e}")
    try:
        model = YOLO('yolov12n.pt') # nano 모델로 재시도
    except Exception as e_nano:
        print(f"Failed to load nano model either: {e_nano}")
        print("Please ensure 'yolov8s.pt' or 'yolov12n.pt' is in the correct path.")
        model = None # 모델 로드 실패
        
# 핸드폰 클래스 ID (COCO 데이터셋 기준)
PHONE_CLASS_ID = 67 
PERSON_CLASS_ID = 0

# 핸드폰 감지 설정
CONF_THRESHOLD = 0.6 
PHONE_DETECTION_TIME = 3.0 
PERSON_DETECTION_TIME = 10.0 

# 핸드폰 감지용 변수
phone_detected_start_time = None
person_not_detected_start_time = None 
is_person_present = True 
is_using_phone = False


# --- [모듈 3: 순공 시간 타이머] 추가 ---
total_study_time = 0.0 
study_session_start_time = None 
is_timer_running = False 
current_status = "Initializing" 

# --- [새로 추가] 모듈 4: 일일 통계 카운터 ---
drowsy_count = 0
phone_count = 0
away_count = 0

# 이벤트가 지속되는 동안 중복 카운트를 방지하기 위한 플래그
drowsy_event_counted = False
phone_event_counted = False
away_event_counted = False
# --- [추가 완료] ---


# --- [수정] get_current_stats() 함수 ---
# (이 함수는 generate_frames() 보다 위에 있어야 합니다)
def get_current_stats():
    """
    현재 AI 모니터의 상태(시간, 상태, 카운트)를 
    전역 변수에서 읽어와 딕셔너리로 반환합니다.
    """
    return {
        "total_study_time": total_study_time,
        "study_session_start_time": study_session_start_time,
        "is_timer_running": is_timer_running,
        "current_status": current_status,
        
        # [새로 추가] 카운트 딕셔너리
        "counts": {
            "drowsy": drowsy_count,
            "phone": phone_count,
            "away": away_count
        }
    }

# --- [핵심] 비디오 프레임 제너레이터 함수 ---
def generate_frames():
    global drowsy_counter, is_drowsy, phone_detected_start_time, person_not_detected_start_time
    global is_person_present, is_using_phone, total_study_time, study_session_start_time
    global is_timer_running, current_status
    global drowsy_count, phone_count, away_count
    global drowsy_event_counted, phone_event_counted, away_event_counted
    
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Error: Could not open video stream.")
        return

    if model is None:
        print("Error: YOLO model not loaded. Exiting.")
        cap.release()
        return

    try:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break

            # 1. 프레임 기본 처리 (좌우 반전)
            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            current_time = time.time() 

            # 2. 핸드폰 및 사람 감지 (YOLO)
            phone_found_in_frame = False
            person_found_in_frame = False
            
            yolo_results = model(frame, stream=True, verbose=False) 

            for r in yolo_results:
                boxes = r.boxes
                for box in boxes:
                    cls_id = int(box.cls[0])
                    confidence = float(box.conf[0])

                    if cls_id == PHONE_CLASS_ID and confidence > CONF_THRESHOLD:
                        phone_found_in_frame = True
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.putText(frame, f"Cell Phone: {confidence:.2f}", (x1, y1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

                    if cls_id == PERSON_CLASS_ID and confidence > CONF_THRESHOLD:
                        person_found_in_frame = True

            # 핸드폰 사용 시간 타이머 로직
            if phone_found_in_frame:
                if phone_detected_start_time is None:
                    phone_detected_start_time = current_time 
                else:
                    elapsed_time = current_time - phone_detected_start_time
                    cv2.putText(frame, f"Phone Timer: {elapsed_time:.1f}s", (10, 60),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                    if elapsed_time >= PHONE_DETECTION_TIME:
                        is_using_phone = True
                        cv2.putText(frame, "!!! USING PHONE !!!", (w - 300, 60),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                phone_detected_start_time = None 
                is_using_phone = False
            
            # 자리 비움 감지 로직
            if not person_found_in_frame: 
                if person_not_detected_start_time is None:
                    person_not_detected_start_time = current_time 
                else:
                    elapsed_time = current_time - person_not_detected_start_time
                    cv2.putText(frame, f"Person Timer: {elapsed_time:.1f}s", (10, 90),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

                    if elapsed_time >= PERSON_DETECTION_TIME:
                        is_person_present = False 
                        cv2.putText(frame, "!!! NO PERSON DETECTED !!!", (w - 400, 90),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                person_not_detected_start_time = None 
                is_person_present = True 


            # 3. 졸음 감지 (MediaPipe)
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image_rgb.flags.writeable = False 
            mesh_results = face_mesh.process(image_rgb)
            
            ear = 0.0
            
            if mesh_results.multi_face_landmarks:
                for face_landmarks in mesh_results.multi_face_landmarks:
                    landmarks = face_landmarks.landmark 
                    left_ear = get_ear(landmarks, LEFT_EYE_INDICES)
                    right_ear = get_ear(landmarks, RIGHT_EYE_INDICES)
                    ear = (left_ear + right_ear) / 2.0

                    cv2.putText(frame, f"EAR: {ear:.2f}", (10, 30), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                    if ear < EAR_THRESHOLD and ear != 0.0:
                        drowsy_counter += 1
                        
                        if drowsy_counter >= DROWSY_CONSEC_FRAMES:
                            is_drowsy = True 
                            cv2.putText(frame, "!!! DROWSY ALERT !!!", (w - 300, 30),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                    else:
                        drowsy_counter = 0 
                        is_drowsy = False 


            # 4. 순공 시간 타이머 로직
            is_studying = (not is_drowsy) and (not is_using_phone) and (is_person_present)

            if is_studying:
                current_status = "Studying"
                if not is_timer_running:
                    study_session_start_time = current_time
                    is_timer_running = True
                drowsy_event_counted = False
                phone_event_counted = False
                away_event_counted = False
            else:
                # '딴짓' 상태일 때
                if is_timer_running:
                    elapsed = current_time - study_session_start_time
                    total_study_time += elapsed
                    is_timer_running = False
                    study_session_start_time = None

                # [카운팅 로직]
                if is_drowsy:
                    current_status = "Drowsy"
                    if not drowsy_event_counted: # 아직 이 '졸음' 이벤트를 카운트하지 않았다면
                        drowsy_count += 1
                        drowsy_event_counted = True # 카운트했다고 표시
                        
                elif is_using_phone:
                    current_status = "Using Phone"
                    if not phone_event_counted: # 아직 이 '폰 사용' 이벤트를 카운트하지 않았다면
                        phone_count += 1
                        phone_event_counted = True # 카운트했다고 표시
                        
                elif not is_person_present:
                    current_status = "Away"
                    if not away_event_counted: # 아직 이 '자리 비움' 이벤트를 카운트하지 않았다면
                        away_count += 1
                        away_event_counted = True # 카운트했다고 표시
                
                # [플래그 교차 리셋]
                # (예: '졸음' 상태에서 '폰 사용' 상태로 바로 넘어갈 경우를 대비)
                if not is_drowsy:
                    drowsy_event_counted = False
                if not is_using_phone:
                    phone_event_counted = False
                if is_person_present: # (not 'Away')
                    away_event_counted = False

            # 5. 최종 화면 출력 (텍스트 그리기)
            display_time_sec = total_study_time
            if is_timer_running:
                display_time_sec += (current_time - study_session_start_time)
                
            hours = int(display_time_sec // 3600)
            minutes = int((display_time_sec % 3600) // 60)
            seconds = int(display_time_sec % 60)
            timer_text = f"{hours:02}:{minutes:02}:{seconds:02}"
            
            status_color = (0, 255, 0) if is_timer_running else (0, 0, 255)

            cv2.putText(frame, f"Status: {current_status}", (10, h - 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)
            cv2.putText(frame, f"Study Time: {timer_text}", (10, h - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)

            # --- [수정] ---
            # cv2.imshow 대신 프레임을 JPEG로 인코딩하여 yield
            (flag, encodedImage) = cv2.imencode(".jpg", frame)
            if not flag:
                continue

            # (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')
            # 위 포맷은 multipart/x-mixed-replace 형식의 스트림을 만듭니다.
            yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + 
                  bytearray(encodedImage) + b'\r\n')
            
            # (원래 코드의 cv2.waitKey)
            # 웹 스트리밍에서는 이 부분이 필요 없습니다.
            # if cv2.waitKey(5) & 0xFF == 27:
            #     break
            
    finally:
        print("Releasing video capture")
        cap.release()
        # cv2.destroyAllWindows() # 서버 환경에서는 필요 없음