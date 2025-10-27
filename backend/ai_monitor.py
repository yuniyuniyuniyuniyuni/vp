# backend/ai_monitor.py

import cv2
import mediapipe as mp
import math
import time
from ultralytics import YOLO
import numpy as np

class AIEngine:
    """
    모든 AI 분석 기능과 상태를 관리하는 통합 엔진 클래스.
    - [개선] 더 직관적인 '코-턱 비율' 기반 고개 숙임 감지
    - [유지] EAR 기반 졸음 감지
    - [유지] 시간 기반 핸드폰/자리 비움 감지
    - [유지] Pose 기반 눕기 감지
    - [추가] 눕기 통계 카운팅
    - [유지] 순공 시간 계산
    """
    def __init__(self):
        # --- 모델 로드 ---
        self.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.mp_pose = mp.solutions.pose.Pose()
        try:
            self.yolo_model = YOLO('yolo12n.pt')
            print("AI Engine: Ultralytics YOLO12n model loaded.")
        except Exception as e:
            self.yolo_model = None; print(f"AI Engine Error: Could not load YOLO model: {e}")

        # --- 감지 설정값 ---
        self.EAR_THRESHOLD = 0.20
        self.DROWSY_CONSEC_FRAMES = 48
        self.PHONE_CONF_THRESHOLD = 0.3
        self.PHONE_DETECT_SECONDS = 3.0
        self.AWAY_DETECT_SECONDS = 10.0
        self.HEAD_TILT_RATIO_THRESHOLD = 0.45 # 코-턱 비율 임계값 (작을수록 숙인 것)
        self.HEAD_DOWN_SECONDS = 5.0

        self.LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
        self.PHONE_CLASS_ID = 67; self.PERSON_CLASS_ID = 0

        # --- 상태 변수 ---
        self.head_tilt_ratio = 0
        self.current_status = "Initializing"
        self.is_studying = False
        self.is_drowsy = False
        self.is_phone_visible = False
        self.is_looking_down = False
        self.is_using_phone = False
        self.is_person_present = True
        self.is_lying_down = False

        # --- 타이머 및 카운터 ---
        self.drowsy_counter = 0
        self.phone_detected_start_time = None
        self.person_not_detected_start_time = None
        self.head_down_start_time = None
        self.initial_shoulder = None
        self.is_calibrating = True
        self.calibration_frames = []
        
        # --- 통계 ---
        self.drowsy_count, self.phone_count, self.away_count, self.lying_down_count = 0, 0, 0, 0
        self.drowsy_event_counted, self.phone_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False, False
        
        # --- 순공 시간 ---
        self.total_study_time = 0.0
        self.study_session_start_time = None
        self.is_timer_running = False

    # --- [Supabase 연동 메소드 1] ---
    def load_user_stats(self, stats_data: dict):
        """
        Supabase에서 불러온 데이터로 AI 엔진의 상태를 덮어씁니다.
        새로운 세션이 시작되므로 타이머와 캘리브레이션은 리셋합니다.
        """
        if not stats_data:
            print("AI Engine: No existing stats data. Starting fresh.")
            stats_data = {} # 빈 딕셔너리로 설정하여 아래 .get()이 작동하게 함

        # DB에서 불러온 영구 통계 로드
        self.total_study_time = stats_data.get("total_study_seconds", 0.0)
        self.drowsy_count = stats_data.get("drowsy_count", 0)
        self.phone_count = stats_data.get("phone_count", 0)
        self.away_count = stats_data.get("away_count", 0)
        self.lying_down_count = stats_data.get("lying_down_count", 0)

        print(f"AI Engine: Stats loaded. Total study time: {self.total_study_time}s")

        # --- 세션 시작을 위해 임시 변수들은 모두 리셋 ---
        self.drowsy_event_counted, self.phone_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False, False
        self.study_session_start_time = None
        self.is_timer_running = False
        self.current_status = "Initializing"
        self.is_studying = False
        self.is_drowsy = False
        self.is_phone_visible = False
        self.is_looking_down = False
        self.is_using_phone = False
        self.is_person_present = True # 시작 시에는 사람이 있다고 가정
        self.is_lying_down = False
        self.drowsy_counter = 0
        self.phone_detected_start_time = None
        self.person_not_detected_start_time = None
        self.head_down_start_time = None
        
        # --- 눕기 감지를 위해 캘리브레이션 리셋 ---
        self.initial_shoulder = None
        self.is_calibrating = True
        self.calibration_frames = []

    # --- [Supabase 연동 메소드 2] ---
    def commit_running_time(self):
        """
        현재 실행 중인 스터디 세션 시간을 total_study_time에 확정(commit)합니다.
        주로 세션 종료(DB 저장) 직전에 호출됩니다.
        """
        if self.is_timer_running and self.study_session_start_time:
            elapsed = time.time() - self.study_session_start_time
            self.total_study_time += elapsed
            self.study_session_start_time = time.time() # 즉시 새 세션 시작

    # --- [Supabase 연동 메소드 3] ---
    def get_user_stats_for_db(self) -> dict:
        """
        현재 엔진 상태를 Supabase DB 스키마에 맞는 딕셔너리로 반환합니다.
        """
        return {
            "total_study_seconds": self.total_study_time,
            "drowsy_count": self.drowsy_count,
            "phone_count": self.phone_count,
            "away_count": self.away_count,
            "lying_down_count": self.lying_down_count,
            "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()) # UTC 시간
        }

    def _euclidean_distance(self, p1, p2):
        return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

    def _get_ear(self, landmarks, indices):
        try:
            v1 = self._euclidean_distance(landmarks[indices[1]], landmarks[indices[5]])
            v2 = self._euclidean_distance(landmarks[indices[2]], landmarks[indices[4]])
            h = self._euclidean_distance(landmarks[indices[0]], landmarks[indices[3]])
            return (v1 + v2) / (2.0 * h) if h > 0 else 0.0
        except: return 0.0

    def _analyze_yolo(self, frame):
        phone_found, person_found = False, False
        if not self.yolo_model: return
        results = self.yolo_model(frame, verbose=False)
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                if cls_id == self.PHONE_CLASS_ID and conf > self.PHONE_CONF_THRESHOLD:
                    phone_found = True
                if cls_id == self.PERSON_CLASS_ID and conf > 0.5:
                    person_found = True
        
        current_time = time.time()
        if phone_found:
            if self.phone_detected_start_time is None: self.phone_detected_start_time = current_time
            elif current_time - self.phone_detected_start_time > self.PHONE_DETECT_SECONDS: self.is_phone_visible = True
        else:
            self.phone_detected_start_time = None; self.is_phone_visible = False

        if not person_found:
            if self.person_not_detected_start_time is None: self.person_not_detected_start_time = current_time
            elif current_time - self.person_not_detected_start_time > self.AWAY_DETECT_SECONDS: self.is_person_present = False
        else:
            self.person_not_detected_start_time = None; self.is_person_present = True

    def _analyze_face_and_head(self, rgb_frame):
        mesh_results = self.mp_face_mesh.process(rgb_frame)
        if mesh_results.multi_face_landmarks:
            landmarks = mesh_results.multi_face_landmarks[0].landmark
            
            left_ear = self._get_ear(landmarks, self.LEFT_EYE_INDICES)
            right_ear = self._get_ear(landmarks, self.RIGHT_EYE_INDICES)
            ear = (left_ear + right_ear) / 2.0
            if ear < self.EAR_THRESHOLD and ear > 0.0:
                self.drowsy_counter += 1
                if self.drowsy_counter >= self.DROWSY_CONSEC_FRAMES: self.is_drowsy = True
            else:
                self.drowsy_counter = 0; self.is_drowsy = False

            nose_tip = landmarks[1]; chin = landmarks[152]
            left_cheek = landmarks[234]; right_cheek = landmarks[454]
            face_width = self._euclidean_distance(left_cheek, right_cheek)
            nose_chin_dist = abs(nose_tip.y - chin.y)
            if face_width > 0: self.head_tilt_ratio = nose_chin_dist / face_width
            
            current_time = time.time()
            if self.head_tilt_ratio < self.HEAD_TILT_RATIO_THRESHOLD and self.head_tilt_ratio > 0:
                if self.head_down_start_time is None: self.head_down_start_time = current_time
                elif current_time - self.head_down_start_time > self.HEAD_DOWN_SECONDS: self.is_looking_down = True
            else:
                self.head_down_start_time = None; self.is_looking_down = False
        else:
            self.drowsy_counter = 0; self.is_drowsy = False; self.is_looking_down = False
            self.head_tilt_ratio = 0

    def _calibrate_posture(self, pose_results):
        if pose_results.pose_landmarks:
            landmarks = pose_results.pose_landmarks.landmark
            shoulder = landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER]
            nose = landmarks[mp.solutions.pose.PoseLandmark.NOSE]
            self.calibration_frames.append({'shoulder_y': shoulder.y, 'nose_y': nose.y})
        if len(self.calibration_frames) >= 100:
            if not self.calibration_frames: self.initial_shoulder = None
            else:
                avg_shoulder_y = sum(f['shoulder_y'] for f in self.calibration_frames) / len(self.calibration_frames)
                avg_nose_y = sum(f['nose_y'] for f in self.calibration_frames) / len(self.calibration_frames)
                self.initial_shoulder = {'y': avg_shoulder_y, 'nose_y': avg_nose_y}
            self.is_calibrating = False

    def _analyze_posture(self, pose_results):
        if pose_results.pose_landmarks and self.initial_shoulder:
            landmarks = pose_results.pose_landmarks.landmark
            current_shoulder_y = landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER].y
            current_nose_y = landmarks[mp.solutions.pose.PoseLandmark.NOSE].y
            is_shoulder_down = current_shoulder_y > self.initial_shoulder['y'] + 0.1
            is_nose_down = current_nose_y > self.initial_shoulder['nose_y'] + 0.15
            self.is_lying_down = is_shoulder_down and is_nose_down
        else: self.is_lying_down = False
    
    def _update_status_and_timers(self):
        # 고개 숙임(looking_down)도 핸드폰 사용(using_phone)으로 간주
        self.is_using_phone = self.is_phone_visible or self.is_looking_down
        self.is_studying = self.is_person_present and not self.is_using_phone and not self.is_drowsy and not self.is_lying_down
        
        current_time = time.time()
        if self.is_studying:
            self.current_status = "Studying"
            if not self.is_timer_running: self.study_session_start_time = current_time; self.is_timer_running = True
            # 공부 시작 시 모든 '딴짓' 플래그 초기화
            self.drowsy_event_counted = self.phone_event_counted = self.away_event_counted = self.lying_down_event_counted = False
        else:
            # 공부 중이 아닐 때: 타이머 중지 및 상태 업데이트
            if self.is_timer_running:
                self.total_study_time += current_time - self.study_session_start_time
                self.is_timer_running = False; self.study_session_start_time = None

            # 상태 우선순위: 졸음 > 폰/고개숙임 > 자리비움 > 눕기
            if self.is_drowsy:
                self.current_status = "Drowsy"
                if not self.drowsy_event_counted: self.drowsy_count += 1; self.drowsy_event_counted = True
            elif self.is_using_phone:
                self.current_status = "Using Phone" # "Looking Down"도 여기에 포함됨
                if not self.phone_event_counted: self.phone_count += 1; self.phone_event_counted = True
            elif not self.is_person_present:
                self.current_status = "Away"
                if not self.away_event_counted: self.away_count += 1; self.away_event_counted = True
            elif self.is_lying_down:
                self.current_status = "Lying Down"
                if not self.lying_down_event_counted: self.lying_down_count += 1; self.lying_down_event_counted = True
            else:
                # 위 모든 케이스에 해당하지 않는 '딴짓' 상태 (예: 캘리브레이션 중)
                if self.is_calibrating:
                    self.current_status = "Calibrating"
                else:
                    self.current_status = "Idle" # 혹은 다른 기본 상태

            # 이벤트 종료 시 플래그 리셋
            if not self.is_drowsy: self.drowsy_event_counted = False
            if not self.is_using_phone: self.phone_event_counted = False
            if self.is_person_present: self.away_event_counted = False
            if not self.is_lying_down: self.lying_down_event_counted = False
    
    def _draw_overlay(self, frame):
        h, w, _ = frame.shape
        display_time_sec = self.total_study_time
        if self.is_timer_running and self.study_session_start_time:
            display_time_sec += (time.time() - self.study_session_start_time)
        hours, rem = divmod(display_time_sec, 3600)
        minutes, seconds = divmod(rem, 60)
        timer_text = f"{int(hours):02}:{int(minutes):02}:{int(seconds):02}"
        
        status_color = (0, 255, 0) if self.is_studying else (0, 0, 255)
        cv2.putText(frame, f"Status: {self.current_status}", (10, h - 40), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)
        cv2.putText(frame, f"Study Time: {timer_text}", (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)
        
        # 디버그 정보 (Head Tilt Ratio)
        cv2.putText(frame, f"Head Tilt Ratio: {self.head_tilt_ratio:.2f}", (w - 300, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        # 디버그 정보 (각 상태)
        statuses = {
            "Phone (Visible)": self.is_phone_visible, "Looking Down": self.is_looking_down,
            "Drowsy": self.is_drowsy, "Lying Down": self.is_lying_down, "Away": not self.is_person_present
        }
        y_pos = 30
        for name, is_active in statuses.items():
            text = f"{name}: {'YES' if is_active else 'NO'}"
            color = (0, 0, 255) if is_active else (0, 255, 0)
            cv2.putText(frame, text, (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            y_pos += 30

    def process(self, frame):
        """
        메인 프로세스 함수. 프레임 하나를 받아 모든 분석을 수행하고
        상태를 업데이트하며, 오버레이가 그려진 프레임을 반환합니다.
        """
        # ai_monitor.py의 기존 로직과 맞추기 위해 좌우 반전을 먼저 수행
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape
        
        # 1. YOLO 분석 (폰, 사람)
        self._analyze_yolo(frame)
        
        # 2. 얼굴/머리 분석 (졸음, 고개 숙임)
        self._analyze_face_and_head(rgb_frame)
        
        # 3. 자세 분석 (눕기)
        pose_results = self.mp_pose.process(rgb_frame)
        
        if self.is_calibrating:
            self._calibrate_posture(pose_results)
            cv2.putText(frame, "Calibrating... Stay Still", (w // 2 - 200, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        else:
            self._analyze_posture(pose_results)
            
            # 4. 상태 종합 및 타이머 업데이트
            self._update_status_and_timers()
            
            # 5. 프레임에 오버레이 그리기
            self._draw_overlay(frame)
        
        # 분석 완료된 프레임 반환
        return frame

    def get_state_for_main_py(self):
        """
        main.py의 websocket_stats_endpoint가 요구하는
        형식에 맞춰 상태 딕셔너리를 반환합니다.
        (기존 get_current_stats의 역할)
        """
        # DB에 저장하기 전에, 현재 돌고있는 시간도 합산해서 프론트에 보내줌
        display_time_sec = self.total_study_time
        if self.is_timer_running and self.study_session_start_time:
            display_time_sec += (time.time() - self.study_session_start_time)
            
        return {
            # "total_study_seconds": self.total_study_time, # -> display_time_sec로 변경
            "total_study_seconds": display_time_sec,
            "study_session_start_time": self.study_session_start_time,
            "is_timer_running": self.is_timer_running,
            "current_status": self.current_status,
            "counts": {
                "drowsy": self.drowsy_count,
                "phone": self.phone_count,
                "away": self.away_count,
                "lying_down": self.lying_down_count 
            }
        }
#
# [통합 완료] AIEngine 클래스
#

# --- AIEngine의 단일 인스턴스를 전역으로 생성합니다. ---
try:
    ai_engine_instance = AIEngine()
except Exception as e:
    print(f"Failed to initialize AIEngine: {e}")
    ai_engine_instance = None

# --- main.py가 호출하는 함수 ---
def get_current_stats():
    """
    현재 AI 모니터의 상태(시간, 상태, 카운트)를 
    AIEngine 인스턴스에서 읽어와 딕셔너리로 반환합니다.
    """
    if ai_engine_instance:
        return ai_engine_instance.get_state_for_main_py()
    else:
        # 엔진 로드 실패 시 기본값 반환
        return {
            "total_study_seconds": 0.0,
            "study_session_start_time": None,
            "is_timer_running": False,
            "current_status": "Error: Engine Failed",
            "counts": {"drowsy": 0, "phone": 0, "away": 0, "lying_down": 0}
        }

# --- main.py가 호출하는 비디오 스트리밍 함수 ---
def generate_frames():
    
    if ai_engine_instance is None or ai_engine_instance.yolo_model is None:
        print("Error: AI Engine or YOLO model not loaded. Exiting frame generation.")
        # 에러 메시지를 담은 임시 프레임 생성
        error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(error_frame, "Error: Model Load Failed", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        (flag, encodedImage) = cv2.imencode(".jpg", error_frame)
        if flag:
            yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + 
                  bytearray(encodedImage) + b'\r\n')
        return

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Error: Could not open video stream.")
        return

    try:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                print("Warning: Failed to read frame from camera.")
                break

            # AIEngine의 메인 process 함수 호출
            processed_frame = ai_engine_instance.process(frame)
            
            # 처리된 프레임을 JPEG로 인코딩하여 yield
            (flag, encodedImage) = cv2.imencode(".jpg", processed_frame)
            if not flag:
                continue

            yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + 
                  bytearray(encodedImage) + b'\r\n')
            
    except Exception as e:
        print(f"An error occurred during frame generation: {e}")
    finally:
        print("Releasing video capture")
        cap.release()