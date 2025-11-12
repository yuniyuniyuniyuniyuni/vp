print("===== ai_monitor.py 파일 새로 읽음 (버전 21.0 + DB 얼굴 인증) =====")
import cv2
import mediapipe as mp
import math
import time
from ultralytics import YOLO                    # type: ignore
import numpy as np
import threading        # type: ignore      
import base64
import os 

try:
    import face_recognition
    import threading             # type: ignore               
    from queue import Queue         # type: ignore            
    FACE_RECOGNITION_ENABLED = True
    print("AI Engine: face_recognition 모듈 로드 성공. 얼굴 인증 기능이 활성화됩니다.")
except ImportError as e:
    FACE_RECOGNITION_ENABLED = False
    print(f"AI Engine Warning: face_recognition 모듈 로드 실패. {e}")
    print("AI Engine Warning: 얼굴 인증 기능이 비활성화됩니다. (Apple Silicon: brew install cmake && pip install dlib)")
    class Queue:
        def __init__(self, maxsize=0): pass
        def empty(self): return True
        def put_nowait(self, item): pass
        def get(self, timeout=0): raise Exception("Queue is disabled")
    class threading:
        class Lock:
            def __enter__(self): pass
            def __exit__(self, exc_type, exc_value, traceback): pass
        class Thread:
            def __init__(self, target=None, daemon=None): pass
            def start(self): pass
            def is_alive(self): return False
            def join(self, timeout=0): pass


class AIEngine:
    def __init__(self, supabase_client=None):
        print("===== AIEngine 클래스 초기화 시작 (버전 21.0 + DB 얼굴 인증) =====")
        
        self.mp_face_mesh = None
        self.mp_pose = None
        self.yolo_model = None
        
        self._models_loaded = False
        self._model_load_lock = threading.Lock()
        
        self.EAR_THRESHOLD = 0.20
        self.DROWSY_CONSEC_FRAMES = 48
        self.AWAY_DETECT_SECONDS = 8.0
        self.HEAD_TILT_RATIO_THRESHOLD = 0.55 
        self.LYING_DOWN_NOSE_DOWN_THRESHOLD = 0.05 
        self.LYING_DOWN_SECONDS = 10.0
        self.HEAD_DOWN_SECONDS = 10.0 
        self.LYING_DOWN_NOSE_GRACE = -0.02
        self.LEANING_BACK_RATIO_THRESHOLD = 0.75
        self.LEANING_BACK_SECONDS = 10.0
        self.HEAD_TURN_RATIO_THRESHOLD = 1.8 
        self.LOOKING_AWAY_SECONDS = 10.0
        self.CHIN_WRIST_THRESHOLD = 0.4 
        self.CHIN_RESTING_SECONDS = 10.0

        self.LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
        self.PERSON_CLASS_ID = 0

        self.head_tilt_ratio = 0.0
        self.head_turn_ratio = 1.0 
        self.current_status = "Initializing"
        self.is_studying = False
        self.is_drowsy = False
        self.is_person_present = True
        self.is_lying_down = False
        self.is_leaning_back = False 
        self.is_looking_away = False 
        self.is_chin_resting = False 
        self.face_detected = True 
        self.pose_detected = False 
        self.drowsy_counter = 0
        self.person_not_detected_start_time = None
        self.head_down_counter = 0
        self.head_up_counter = 0
        
        self.HEAD_DOWN_CONSEC_FRAMES = int(self.HEAD_DOWN_SECONDS * 10) 
        self.HEAD_UP_GRACE_FRAMES = 10 
        
        self.lying_down_start_time = None
        self.leaning_back_start_time = None
        self.looking_away_start_time = None 
        self.chin_resting_start_time = None 
        self.initial_shoulder = None
        self.initial_face_width = 0.0 
        self.initial_head_turn_ratio = 1.0 
        self.is_calibrating = True
        self.calibration_frames = []
        self.drowsy_count, self.away_count, self.lying_down_count = 0, 0, 0
        self.leaning_back_count = 0 
        self.looking_away_count = 0 
        self.drowsy_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False
        self.leaning_back_event_counted = False 
        self.looking_away_event_counted = False 
        self.current_daily_study_time = 0.0
        self.study_session_start_time = None
        self.is_timer_running = False
        self.drowsy_seconds = 0.0
        self.away_seconds = 0.0
        self.lying_down_seconds = 0.0
        self.leaning_back_seconds = 0.0 
        self.looking_away_seconds = 0.0 
        self.current_non_study_state = None 
        self.non_study_start_time = None
        self.session_start_daily_stats = {}
        self.delta_nose_y = 0.0
        self.delta_face_ratio = 1.0
        self.debug_chin_wrist_dist = float('inf') 

        
        self.supabase = supabase_client 
        self.user_email = None          
        self.registered_face_encoding = None  
        self.is_face_registered = False
        self.face_verification_interval = 30
        self.face_distance_threshold = 0.55
        self.frame_count = 0
        self.unknown_person_consecutive_frames = 0
        self.unknown_person_frame_threshold = 50
        self.face_verification_queue = Queue(maxsize=1)
        self.face_verification_result = {"verified": True, "present": True}
        self.face_verification_lock = threading.Lock()
        self.face_verification_thread = None
        self.face_verification_running = False
        self.is_authenticated_user = True 

        if not FACE_RECOGNITION_ENABLED:
            print("AI Engine: Face registration status: DISABLED")
        elif self.supabase is None:
            print("AI Engine: Supabase client not provided. Face auth disabled.")
        else:
            print("AI Engine: Ready for DB-based face authentication.")
        
    def _load_models_if_needed(self):
        if self._models_loaded:
            return
        
        with self._model_load_lock:
            if self._models_loaded:
                return
            
            print("AI Engine: First request. Starting lazy-loading AI models...")
            try:
                self.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(               # type: ignore
                    max_num_faces=1, 
                    refine_landmarks=True, 
                    min_detection_confidence=0.5, 
                    min_tracking_confidence=0.5
                )
                self.mp_pose = mp.solutions.pose.Pose()                     # type: ignore
                
                self.yolo_model = YOLO('yolo12n.pt')  # type: ignore
                
                self._models_loaded = True
                print("AI Engine: YOLO, FaceMesh, Pose models loaded successfully.")
            except Exception as e:
                print(f"CRITICAL: Failed to lazy-load AI models: {e}")
                self._models_loaded = False

    def __del__(self):
        print("AIEngine 소멸자 호출됨. 스레드 정리 시도...")
        self._stop_face_verification_thread()
        
    
    def _load_face_encoding(self):
        if not FACE_RECOGNITION_ENABLED or not self.supabase or not self.user_email:
            self.is_face_registered = False
            return
            
        try:
            response = self.supabase.table("user_stats").select("face_encoding").eq("user_email", self.user_email).execute()
            
            if response.data and response.data[0].get('face_encoding'):
                
                encoding_base64_str = response.data[0]['face_encoding']
                encoding_bytes = base64.b64decode(encoding_base64_str)
                encoding_array = np.frombuffer(encoding_bytes, dtype=np.float64)
                
                self.registered_face_encoding = np.array(encoding_array)
                self.is_face_registered = True
                print(f"AI Engine: Face encoding loaded from DB for {self.user_email}.")
            else:
                self.is_face_registered = False
                self.registered_face_encoding = None
                print(f"AI Engine: No face encoding found in DB for {self.user_email}.")
        except Exception as e:
            print(f"Error loading face encoding from DB: {e}")
            self.is_face_registered = False
            self.registered_face_encoding = None
    
    
    
    def _start_face_verification_thread(self):
        if not FACE_RECOGNITION_ENABLED: return
        if self.face_verification_thread is not None and self.face_verification_thread.is_alive():
            return
        
        self.face_verification_running = True
        self.face_verification_thread = threading.Thread(target=self._face_verification_worker, daemon=True)
        self.face_verification_thread.start()
        print("AI Engine: Face verification thread started.")
    
    def _stop_face_verification_thread(self):
        if not FACE_RECOGNITION_ENABLED: return
        self.face_verification_running = False
        if self.face_verification_thread is not None and self.face_verification_thread.is_alive():
            
            with self.face_verification_queue.mutex:        # type: ignore
                self.face_verification_queue.queue.clear()  # type: ignore
            self.face_verification_thread.join(timeout=2)
            print("AI Engine: Face verification thread stopped.")
    
    def _face_verification_worker(self):
        if not FACE_RECOGNITION_ENABLED: return
        while self.face_verification_running:
            try:
                if not self.face_verification_queue.empty():
                    rgb_frame = self.face_verification_queue.get(timeout=0.5)   # type: ignore
                    
                    if not self.face_verification_running:
                        break
                        
                    is_verified, is_present = self._verify_registered_user_internal(rgb_frame)
                    
                    with self.face_verification_lock:
                        self.face_verification_result = {
                            "verified": is_verified,
                            "present": is_present
                        }
                else:
                    time.sleep(0.1)
            except Exception as e:
                if "empty" not in str(e).lower() and self.face_verification_running:
                    print(f"Face verification worker error: {e}")
                time.sleep(0.1)
        
    def _verify_registered_user_internal(self, rgb_frame):
        if not FACE_RECOGNITION_ENABLED or not self.is_face_registered or self.registered_face_encoding is None:
            return True, True 
        
        try:
            face_locations = face_recognition.face_locations(rgb_frame)
            if not face_locations:
                return False, False # (Verified=False, Present=False) - 얼굴 없음

            current_face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
            if not current_face_encodings:
                return False, False # (Verified=False, Present=False) - 인코딩 실패
            
            if len(current_face_encodings) == 0:
                return False, False # (Verified=False, Present=False) - 얼굴 없음

            found_unknown_face = False
            for current_encoding in current_face_encodings:
                # 등록된 얼굴과 현재 얼굴 비교
                matches = face_recognition.compare_faces(
                    [self.registered_face_encoding], 
                    current_encoding, 
                    tolerance=self.face_distance_threshold
                )
                if not matches[0]:
                    found_unknown_face = True
                    break 
        
            return not found_unknown_face, True 

        except Exception as e:
            print(f"Face verification internal error: {e}")
            return False, False
    
    def is_encoding_possible(self, rgb_frame):
        if not FACE_RECOGNITION_ENABLED:
            return False
        try:
            face_locations = face_recognition.face_locations(rgb_frame)
            if not face_locations:
                return False 
            
            current_face_encodings = face_recognition.face_encodings(rgb_frame, [face_locations[0]])
            if not current_face_encodings:
                return False 
            
            return True 
        except Exception:
            return False
    
    def register_user_face(self, frame):
        if not FACE_RECOGNITION_ENABLED:
            return False, "얼굴 인증 모듈(face_recognition)이 설치되지 않았습니다."
        if not self.supabase:
            return False, "Supabase 클라이언트가 설정되지 않았습니다."
        if not self.user_email:
            return False, "로그인된 사용자 정보가 없습니다 (WebSocket 연결 필요)."
            
        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            face_locations = face_recognition.face_locations(rgb_frame)
            if not face_locations:
                return False, "얼굴이 감지되지 않았습니다. 카메라를 정면으로 봐주세요."
            if len(face_locations) > 1:
                return False, "여러 명의 얼굴이 감지되었습니다. 혼자 있을 때 등록해주세요."
            
            current_face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
            if not current_face_encodings:
                return False, "얼굴 특징 추출에 실패했습니다."
            
            encoding_array = current_face_encodings[0]
            
            encoding_bytes = encoding_array.tobytes()
            encoding_base64_str = base64.b64encode(encoding_bytes).decode('utf-8')
            
            
            response = self.supabase.table("user_stats") \
                           .update({"face_encoding": encoding_base64_str}) \
                           .eq("user_email", self.user_email) \
                           .execute()
            
            if response.data:
                self.registered_face_encoding = encoding_array
                self.is_face_registered = True
                self._start_face_verification_thread() 
                print(f"AI Engine: User face registered to DB for {self.user_email}.")
                return True, f"얼굴이 성공적으로 등록되었습니다!"
            else:
                print(f"DB update error: {response.error}")
                return False, "DB에 얼굴 인코딩 저장 실패"
            
        except Exception as e:
            print(f"Face registration error: {e}")
            return False, f"얼굴 등록 실패: {str(e)}"
    
    
    def delete_registered_face(self):
        if not FACE_RECOGNITION_ENABLED:
            return False, "얼굴 인증 모듈(face_recognition)이 설치되지 않았습니다."
        if not self.supabase:
            return False, "Supabase 클라이언트가 설정되지 않았습니다."
        if not self.user_email:
            return False, "로그인된 사용자 정보가 없습니다 (WebSocket 연결 필요)."
            
        try:
            self._stop_face_verification_thread()
            
            
            response = self.supabase.table("user_stats") \
                           .update({"face_encoding": None}) \
                           .eq("user_email", self.user_email) \
                           .execute()

            if response.data:
                self.registered_face_encoding = None
                self.is_face_registered = False
                self.unknown_person_consecutive_frames = 0
                with self.face_verification_lock:
                    self.face_verification_result = {"verified": True, "present": True}
                
                print(f"AI Engine: Face encoding deleted from DB for {self.user_email}.")
                return True, "등록된 얼굴이 삭제되었습니다."
            else:
                return False, f"DB 업데이트 실패: {response.error}"
        except Exception as e:
            return False, f"삭제 실패: {str(e)}"

    
    def load_user_stats(self, daily_stats_data: dict, user_email: str = None):  # type: ignore
        self.user_email = user_email 
        
        if not daily_stats_data:
            print("AI Engine: No existing stats data. Starting fresh.")
            daily_stats_data = {}
            
        
        self.current_daily_study_time = daily_stats_data.get("daily_study_seconds", 0.0) 
        self.drowsy_count = daily_stats_data.get("daily_drowsy_count", 0)
        self.away_count = daily_stats_data.get("daily_away_count", 0)
        self.lying_down_count = daily_stats_data.get("daily_lying_down_count", 0)
        self.leaning_back_count = daily_stats_data.get("daily_leaning_back_count", 0) 
        self.looking_away_count = daily_stats_data.get("daily_looking_away_count", 0) 
        
        self.drowsy_seconds = daily_stats_data.get("daily_drowsy_seconds", 0.0)
        self.away_seconds = daily_stats_data.get("daily_away_seconds", 0.0)
        self.lying_down_seconds = daily_stats_data.get("daily_lying_down_seconds", 0.0)
        self.leaning_back_seconds = daily_stats_data.get("daily_leaning_back_seconds", 0.0) 
        self.looking_away_seconds = daily_stats_data.get("daily_looking_away_seconds", 0.0) 

        print(f"AI Engine: Daily stats loaded for {self.user_email}. Today's study time starting from: {self.current_daily_study_time}s")
        
        self.session_start_daily_stats = {
            "study_seconds": self.current_daily_study_time,
            "drowsy_count": self.drowsy_count,
            "away_count": self.away_count,
            "lying_down_count": self.lying_down_count,
            "leaning_back_count": self.leaning_back_count, 
            "looking_away_count": self.looking_away_count, 
            "daily_drowsy_seconds": self.drowsy_seconds,
            "daily_away_seconds": self.away_seconds,
            "daily_lying_down_seconds": self.lying_down_seconds,
            "daily_leaning_back_seconds": self.leaning_back_seconds,
            "daily_looking_away_seconds": self.looking_away_seconds 
        }

        self.drowsy_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False
        self.leaning_back_event_counted = False 
        self.looking_away_event_counted = False 
        self.current_status = "Initializing"
        self.study_session_start_time = None
        self.is_timer_running = False
        self.is_studying = False
        self.is_drowsy = False
        self.is_person_present = True 
        self.is_lying_down = False
        self.is_leaning_back = False 
        self.is_looking_away = False 
        self.is_chin_resting = False 
        self.drowsy_counter = 0
        self.person_not_detected_start_time = None
        self.lying_down_start_time = None
        self.leaning_back_start_time = None
        self.looking_away_start_time = None 
        self.chin_resting_start_time = None 

        self.initial_shoulder = None
        self.initial_face_width = 0.0 
        self.initial_head_turn_ratio = 1.0 
        self.is_calibrating = True
        self.calibration_frames = []
        self.current_non_study_state = None 
        self.non_study_start_time = None
        self.is_authenticated_user = True 
        
        
        self.is_face_registered = False
        self.registered_face_encoding = None
        self._stop_face_verification_thread() 
        
        if self.user_email and self.supabase:
            self._load_face_encoding() 
            if self.is_face_registered:
                self._start_face_verification_thread() 
                
    def commit_all_running_timers(self):
        current_time = time.time()
        
        if self.is_timer_running and self.study_session_start_time:
            elapsed = current_time - self.study_session_start_time
            self.current_daily_study_time += elapsed
            self.study_session_start_time = current_time 

        if self.current_non_study_state is not None and self.non_study_start_time is not None:
            self._stop_non_study_timer(current_time)

    def get_final_stats(self) -> (dict, dict):      # type: ignore
        
        final_daily_stats = {
            "daily_study_seconds": self.current_daily_study_time, 
            "daily_drowsy_count": self.drowsy_count,
            "daily_away_count": self.away_count,
            "daily_lying_down_count": self.lying_down_count,
            "daily_leaning_back_count": self.leaning_back_count, 
            "daily_looking_away_count": self.looking_away_count, 
            "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "daily_drowsy_seconds": self.drowsy_seconds,
            "daily_away_seconds": self.away_seconds,
            "daily_lying_down_seconds": self.lying_down_seconds,
            "daily_leaning_back_seconds": self.leaning_back_seconds,
            "daily_looking_away_seconds": self.looking_away_seconds 
        }

        session_delta_stats = {
            "study_seconds": self.current_daily_study_time - self.session_start_daily_stats.get("study_seconds", 0.0),
        }

        return final_daily_stats, session_delta_stats

    def _euclidean_distance(self, p1, p2):
        if p1 is None or p2 is None:
            return float('inf') 
        return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

    def _get_ear(self, landmarks, indices):
        try:
            v1 = self._euclidean_distance(landmarks[indices[1]], landmarks[indices[5]])
            v2 = self._euclidean_distance(landmarks[indices[2]], landmarks[indices[4]])
            h = self._euclidean_distance(landmarks[indices[0]], landmarks[indices[3]])
            return (v1 + v2) / (2.0 * h) if h > 0 else 0.0
        except: return 0.0

    
    def _analyze_yolo_and_face(self, frame, rgb_frame):
        person_found_yolo = False 
        
        if self.yolo_model:
            results = self.yolo_model(frame, verbose=False)
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    if cls_id == self.PERSON_CLASS_ID and conf > 0.5:
                        person_found_yolo = True
                        break 
                if person_found_yolo:
                    break
        
        current_time = time.time()

        
        
        if not person_found_yolo:
            if self.person_not_detected_start_time is None: 
                self.person_not_detected_start_time = current_time
            elif current_time - self.person_not_detected_start_time > self.AWAY_DETECT_SECONDS:
                self.is_person_present = False
        else:
            self.person_not_detected_start_time = None
            self.is_person_present = True
        
        
        self.frame_count += 1

        if FACE_RECOGNITION_ENABLED and self.is_face_registered:
            
            if self.frame_count % self.face_verification_interval == 0:
                if self.face_verification_queue.empty():
                    try:
                        self.face_verification_queue.put_nowait(rgb_frame.copy())
                    except Exception:
                        pass 
            
            
            with self.face_verification_lock:
                is_verified = self.face_verification_result["verified"]
                is_present = self.face_verification_result["present"]

            if not is_present:
                
                self.is_authenticated_user = False
                self.unknown_person_consecutive_frames = 0
            elif not is_verified:
                
                self.unknown_person_consecutive_frames += 1
                if self.unknown_person_consecutive_frames > self.unknown_person_frame_threshold:
                    self.is_authenticated_user = False 
            else:
                
                self.is_authenticated_user = True
                self.unknown_person_consecutive_frames = 0
                
        else:
            
            self.is_authenticated_user = self.is_person_present

    
    def _analyze_face_and_head(self, mesh_results):
        self.face_detected = False
        self.head_tilt_ratio = 0.0
        self.head_turn_ratio = 1.0
        self.is_looking_down = False 

        if mesh_results and mesh_results.multi_face_landmarks:
            self.face_detected = True
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
            
            if self.head_tilt_ratio < self.HEAD_TILT_RATIO_THRESHOLD and self.head_tilt_ratio >= 0:
                self.head_up_counter = 0 
                self.head_down_counter += 1
                if self.head_down_counter >= self.HEAD_DOWN_CONSEC_FRAMES: 
                    self.is_looking_down = True
            else:
                self.head_up_counter += 1 
                if self.head_up_counter > self.HEAD_UP_GRACE_FRAMES:
                    self.head_down_counter = 0 
            
            dist_left = self._euclidean_distance(nose_tip, left_cheek)
            dist_right = self._euclidean_distance(nose_tip, right_cheek)
            
            if dist_right > 0:
                self.head_turn_ratio = dist_left / dist_right
            else:
                self.head_turn_ratio = 1.0

            current_time = time.time()
            is_turning = False
            if self.initial_head_turn_ratio > 0:
                ratio_diff = self.head_turn_ratio / self.initial_head_turn_ratio
                if (ratio_diff > self.HEAD_TURN_RATIO_THRESHOLD or 
                    ratio_diff < (1 / self.HEAD_TURN_RATIO_THRESHOLD)):
                    is_turning = True

            if is_turning:
                if self.looking_away_start_time is None:
                    self.looking_away_start_time = current_time
                elif current_time - self.looking_away_start_time > self.LOOKING_AWAY_SECONDS:
                    self.is_looking_away = True
            else:
                self.looking_away_start_time = None
                self.is_looking_away = False
            
        else:
            self.drowsy_counter = 0
            self.is_looking_away = False
            self.looking_away_start_time = None
            if self.head_down_counter > self.HEAD_DOWN_CONSEC_FRAMES // 2:
                self.is_looking_down = True
            else:
                self.head_down_counter = 0
                self.head_up_counter = 0
                
            self.head_tilt_ratio = 0

    def _calibrate_posture(self, pose_results, mesh_results):
        face_width = 0.0
        head_turn_ratio = 1.0

        if mesh_results and mesh_results.multi_face_landmarks:
            landmarks = mesh_results.multi_face_landmarks[0].landmark
            left_cheek = landmarks[234]; right_cheek = landmarks[454]
            face_width = self._euclidean_distance(left_cheek, right_cheek)
            
            nose_tip = landmarks[1]
            dist_left = self._euclidean_distance(nose_tip, left_cheek)
            dist_right = self._euclidean_distance(nose_tip, right_cheek)
            if dist_right > 0:
                head_turn_ratio = dist_left / dist_right

        if pose_results.pose_landmarks and face_width > 0:
            landmarks = pose_results.pose_landmarks.landmark
            shoulder = landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER]             # type: ignore
            nose = landmarks[mp.solutions.pose.PoseLandmark.NOSE]                       # type: ignore
            self.calibration_frames.append({
                'shoulder_y': shoulder.y, 
                'nose_y': nose.y,
                'face_width': face_width,
                'head_turn_ratio': head_turn_ratio 
            })

        if len(self.calibration_frames) >= 100:
            if not self.calibration_frames: 
                self.initial_shoulder = None
                self.initial_face_width = 0.0 
                self.initial_head_turn_ratio = 1.0 
            else:
                avg_shoulder_y = sum(f['shoulder_y'] for f in self.calibration_frames) / len(self.calibration_frames)
                avg_nose_y = sum(f['nose_y'] for f in self.calibration_frames) / len(self.calibration_frames)
                avg_face_width = sum(f['face_width'] for f in self.calibration_frames) / len(self.calibration_frames) 
                avg_head_turn_ratio = sum(f['head_turn_ratio'] for f in self.calibration_frames) / len(self.calibration_frames) 
                
                self.initial_shoulder = {'y': avg_shoulder_y, 'nose_y': avg_nose_y}
                self.initial_face_width = avg_face_width 
                self.initial_head_turn_ratio = avg_head_turn_ratio 
            self.is_calibrating = False

    
    def _analyze_posture(self, pose_results, mesh_results):
        
        self.delta_face_ratio = 1.0
        self.delta_nose_y = 0.0
        self.is_leaning_back = False 
        self.pose_detected = False
        self.is_chin_resting = False 
        self.debug_chin_wrist_dist = float('inf') 

        if not self.initial_shoulder:
            return

        chin_landmark = None
        left_wrist_landmark = None
        right_wrist_landmark = None

        if self.face_detected and mesh_results and mesh_results.multi_face_landmarks:
            chin_landmark = mesh_results.multi_face_landmarks[0].landmark[152] 
        
        if pose_results.pose_landmarks:
            self.pose_detected = True 
            landmarks = pose_results.pose_landmarks.landmark
            current_nose_y = landmarks[mp.solutions.pose.PoseLandmark.NOSE].y   # type: ignore
            self.delta_nose_y = current_nose_y - self.initial_shoulder['nose_y']
            
            left_wrist_landmark = landmarks[mp.solutions.pose.PoseLandmark.LEFT_WRIST]  # type: ignore
            right_wrist_landmark = landmarks[mp.solutions.pose.PoseLandmark.RIGHT_WRIST]    # type: ignore

        if self.face_detected and self.initial_face_width > 0:
            current_face_width = self._euclidean_distance(
                mesh_results.multi_face_landmarks[0].landmark[234], 
                mesh_results.multi_face_landmarks[0].landmark[454]
            )
            self.delta_face_ratio = current_face_width / self.initial_face_width
        elif not self.face_detected:
             self.delta_face_ratio = 1.0 
        
        current_time = time.time()
        
        is_face_small = (self.face_detected and 
                         self.delta_face_ratio < self.LEANING_BACK_RATIO_THRESHOLD)
            
        if is_face_small and not self.is_lying_down: 
            if self.leaning_back_start_time is None:
                self.leaning_back_start_time = current_time
            elif current_time - self.leaning_back_start_time > self.LEANING_BACK_SECONDS:
                self.is_leaning_back = True
        else:
            self.leaning_back_start_time = None

        dist_left = self._euclidean_distance(chin_landmark, left_wrist_landmark)
        dist_right = self._euclidean_distance(chin_landmark, right_wrist_landmark)
        self.debug_chin_wrist_dist = min(dist_left, dist_right) 

        if self.debug_chin_wrist_dist < self.CHIN_WRIST_THRESHOLD:
            if self.chin_resting_start_time is None:
                self.chin_resting_start_time = current_time
            elif current_time - self.chin_resting_start_time > self.CHIN_RESTING_SECONDS:
                self.is_chin_resting = True
        else:
            self.chin_resting_start_time = None

    
    def _update_status_and_timers(self):
        
        current_time = time.time()
        
        trigger_A_lying = (self.face_detected and 
                           self.is_looking_down and 
                           self.delta_nose_y > self.LYING_DOWN_NOSE_GRACE) 

        trigger_B_lying = (not self.face_detected and 
                           not self.is_looking_away and 
                           self.pose_detected and
                           self.is_person_present
                           )

        if trigger_A_lying or trigger_B_lying:
            if self.lying_down_start_time is None:
                self.lying_down_start_time = current_time
            elif current_time - self.lying_down_start_time > self.LYING_DOWN_SECONDS:
                self.is_lying_down = True
        else:
            self.lying_down_start_time = None
            self.is_lying_down = False
            
        with self.face_verification_lock:
            is_face_verified = self.face_verification_result["verified"]
            is_face_present = self.face_verification_result["present"]

        is_unknown_person_detected = is_face_present and (not is_face_verified)
        
        is_truly_away = (not self.is_person_present) and (not self.pose_detected) and (not is_face_present)
        
        is_drowsy_combined = self.is_drowsy or self.is_chin_resting
        
        self.is_studying = (
            not self.is_calibrating and
            not is_truly_away and 
            not is_unknown_person_detected and
            not is_drowsy_combined and 
            not self.is_lying_down and 
            not self.is_leaning_back and
            not self.is_looking_away
        )
        
        if self.is_studying:
            self.current_status = "Studying"
            if not self.is_timer_running: 
                self.study_session_start_time = current_time
                self.is_timer_running = True
            
            if self.current_non_study_state is not None:
                self._stop_non_study_timer(current_time)
                
        else:
            if self.is_timer_running:
                self.current_daily_study_time += current_time - self.study_session_start_time       # type: ignore
                self.is_timer_running = False
                self.study_session_start_time = None

            new_state = None
            if self.is_calibrating:
                new_state = "idle"
                self.current_status = "Calibrating"
                
            elif is_unknown_person_detected: 
                new_state = "away" 
                self.current_status = "Away (Unknown Person)"
            elif is_truly_away:
                new_state = "away"
                self.current_status = "Away (Not Detected)"
                
            elif self.is_lying_down:
                new_state = "lying_down"
                self.current_status = "Lying Down"
            elif self.is_looking_away: 
                new_state = "looking_away"
                self.current_status = "Looking Away"
            elif is_drowsy_combined: 
                new_state = "drowsy"
                self.current_status = "Drowsy (Chin)" if self.is_chin_resting else "Drowsy (Eyes)"
            
            elif is_unknown_person_detected: 
                new_state = "away" 
                self.current_status = "Away (Unknown Person)"
            
            elif is_truly_away:
                new_state = "away"
                self.current_status = "Away (Not Detected)"

            elif self.is_leaning_back: 
                new_state = "leaning_back"
                self.current_status = "Leaning Back"
            else:
                new_state = "idle" 
                self.current_status = "Idle" 

            if new_state != self.current_non_study_state:
                if self.current_non_study_state is not None:
                    self._stop_non_study_timer(current_time)
                
                self.current_non_study_state = new_state
                if new_state != "idle": 
                    self.non_study_start_time = current_time
                    
                    if new_state == "drowsy" and not self.drowsy_event_counted: 
                        self.drowsy_count += 1; self.drowsy_event_counted = True
                    if new_state == "away" and not self.away_event_counted: 
                        self.away_count += 1; self.away_event_counted = True
                    if new_state == "lying_down" and not self.lying_down_event_counted: 
                        self.lying_down_count += 1; self.lying_down_event_counted = True
                    if new_state == "leaning_back" and not self.leaning_back_event_counted: 
                        self.leaning_back_count += 1; self.leaning_back_event_counted = True
                    if new_state == "looking_away" and not self.looking_away_event_counted: 
                        self.looking_away_count += 1; self.looking_away_event_counted = True
                        
        if self.is_studying:
            self.drowsy_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False
            self.leaning_back_event_counted = False
            self.looking_away_event_counted = False 

    def _stop_non_study_timer(self, end_time):
        if self.non_study_start_time is None:
            return 

        elapsed = end_time - self.non_study_start_time
        
        if self.current_non_study_state == "drowsy":
            self.drowsy_seconds += elapsed
        elif self.current_non_study_state == "away":
            self.away_seconds += elapsed
        elif self.current_non_study_state == "lying_down":
            self.lying_down_seconds += elapsed
        elif self.current_non_study_state == "leaning_back": 
            self.leaning_back_seconds += elapsed
        elif self.current_non_study_state == "looking_away": 
            self.looking_away_seconds += elapsed
            
        self.non_study_start_time = None
        self.current_non_study_state = None
    
    def _draw_overlay(self, frame):
        pass

    def process(self, frame):
        self._load_models_if_needed()
        
        if not self._models_loaded or self.yolo_model is None or self.mp_face_mesh is None:
            print("AI Engine: Models not ready, skipping frame.")
            # 상태가 "Initializing" 등으로 유지되도록 해야 할 수 있습니다.
            self.current_status = "Initializing Models"
            return
        
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape
        
        self._analyze_yolo_and_face(frame, rgb_frame) 
        
        mesh_results = self.mp_face_mesh.process(rgb_frame)
        pose_results = self.mp_pose.process(rgb_frame)                     # type: ignore
        
        self._analyze_face_and_head(mesh_results)
        
        if self.is_calibrating:
            self.calibrating_text = "Calibrating... Please Sit Naturally"
            self._calibrate_posture(pose_results, mesh_results)
        else:
            self._analyze_posture(pose_results, mesh_results)
        
        self._update_status_and_timers()
        
    def get_state_for_main_py(self):
        display_time_sec = self.current_daily_study_time
        if self.is_timer_running and self.study_session_start_time:
            display_time_sec += (time.time() - self.study_session_start_time)
            
        return {
            "total_study_seconds": display_time_sec,
            "study_session_start_time": self.study_session_start_time,
            "is_timer_running": self.is_timer_running,
            "current_status": self.current_status,
            "stats": {
                "drowsy": self.drowsy_count,
                "away": self.away_count,
                "lying_down": self.lying_down_count,
                "leaning_back": self.leaning_back_count, 
                "looking_away": self.looking_away_count, 
                "drowsy_seconds": self.drowsy_seconds,
                "away_seconds": self.away_seconds,
                "lying_down_seconds": self.lying_down_seconds, 
                "leaning_back_seconds": self.leaning_back_seconds,
                "looking_away_seconds": self.looking_away_seconds 
            }
        }
        



def get_current_stats(ai_engine_instance):
    if ai_engine_instance:
        return ai_engine_instance.get_state_for_main_py()
    else:
        return {
            "total_study_seconds": 0.0,
            "study_session_start_time": None,
            "is_timer_running": False,
            "current_status": "Error: Engine Failed",
            "counts": {"drowsy": 0, "away": 0, "lying_down": 0, "leaning_back": 0, "looking_away": 0} 
        }