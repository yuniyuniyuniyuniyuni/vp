import cv2
import mediapipe as mp
import math
import time
from ultralytics import YOLO                    # type: ignore
import numpy as np
from deepface import DeepFace
import os
import pickle
import threading
from queue import Queue

class AIEngine:
    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)  # type: ignore
        self.mp_pose = mp.solutions.pose.Pose() # type: ignore
        try:
            self.yolo_model = YOLO('yolo12n.pt')
            print("AI Engine: Ultralytics YOLO12n model loaded.")
        except Exception as e:
            self.yolo_model = None; print(f"AI Engine Error: Could not load YOLO model: {e}")

        self.EAR_THRESHOLD = 0.20
        self.DROWSY_CONSEC_FRAMES = 48
        self.PHONE_CONF_THRESHOLD = 0.3
        self.PHONE_DETECT_SECONDS = 3.0
        self.AWAY_DETECT_SECONDS = 10.0
        self.HEAD_TILT_RATIO_THRESHOLD = 0.45 
        self.HEAD_DOWN_SECONDS = 5.0

        self.LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
        self.RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
        self.PHONE_CLASS_ID = 67; self.PERSON_CLASS_ID = 0

        # 얼굴 인식 - 벡터(임베딩) 방식으로 저장
        self.face_embedding_path = "user_face_embedding.pkl"
        self.registered_face_embedding = None  # 512차원 벡터
        self.is_face_registered = False
        self.face_verification_interval = 30  # 30프레임마다 1번 검증
        self.face_distance_threshold = 0.4  # 코사인 거리 임계값
        self.frame_count = 0
        self.unknown_person_consecutive_frames = 0
        self.unknown_person_frame_threshold = 30

        # 백그라운드 얼굴 인증 스레드
        self.face_verification_queue = Queue(maxsize=1)  # 프레임 큐 (최대 1개)
        self.face_verification_result = {"verified": True, "present": True}  # 기본값
        self.face_verification_lock = threading.Lock()
        self.face_verification_thread = None
        self.face_verification_running = False

        # 저장된 벡터 로드
        self._load_face_embedding()

        self.head_tilt_ratio = 0
        self.current_status = "Initializing"
        self.is_studying = False
        self.is_drowsy = False
        self.is_phone_visible = False
        self.is_looking_down = False
        self.is_using_phone = False
        self.is_person_present = True
        self.is_lying_down = False

        self.drowsy_counter = 0
        self.phone_detected_start_time = None
        self.person_not_detected_start_time = None
        self.head_down_start_time = None
        self.initial_shoulder = None
        self.is_calibrating = True
        self.calibration_frames = []
        
        self.drowsy_count, self.phone_count, self.away_count, self.lying_down_count = 0, 0, 0, 0
        self.drowsy_event_counted, self.phone_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False, False

        self.current_daily_study_time = 0.0
        self.study_session_start_time = None
        self.is_timer_running = False
        
        self.drowsy_seconds = 0.0
        self.phone_seconds = 0.0
        self.away_seconds = 0.0
        self.lying_down_seconds = 0.0

        self.current_non_study_state = None 
        self.non_study_start_time = None

        self.session_start_daily_stats = {}
        
        print(f"AI Engine: Face registration status: {self.is_face_registered}")
        
        # 얼굴 인증이 등록되어 있으면 백그라운드 스레드 시작
        if self.is_face_registered:
            self._start_face_verification_thread()
    
    def _load_face_embedding(self):
        """저장된 얼굴 임베딩 벡터 로드"""
        if os.path.exists(self.face_embedding_path):
            try:
                with open(self.face_embedding_path, 'rb') as f:
                    self.registered_face_embedding = pickle.load(f)
                self.is_face_registered = True
                print(f"AI Engine: Face embedding loaded. Vector shape: {self.registered_face_embedding.shape}")
            except Exception as e:
                print(f"Error loading face embedding: {e}")
                self.registered_face_embedding = None
                self.is_face_registered = False
        else:
            print("AI Engine: No registered face embedding found.")
            self.is_face_registered = False
    
    def _save_face_embedding(self, embedding):
        """얼굴 임베딩 벡터를 파일로 저장"""
        try:
            with open(self.face_embedding_path, 'wb') as f:
                pickle.dump(embedding, f)
            print(f"AI Engine: Face embedding saved. Vector shape: {embedding.shape}")
            return True
        except Exception as e:
            print(f"Error saving face embedding: {e}")
            return False
    
    def _start_face_verification_thread(self):
        """백그라운드 얼굴 인증 스레드 시작"""
        if self.face_verification_thread is not None and self.face_verification_thread.is_alive():
            return
        
        self.face_verification_running = True
        self.face_verification_thread = threading.Thread(target=self._face_verification_worker, daemon=True)
        self.face_verification_thread.start()
        print("AI Engine: Face verification thread started.")
    
    def _stop_face_verification_thread(self):
        """백그라운드 얼굴 인증 스레드 정지"""
        self.face_verification_running = False
        if self.face_verification_thread is not None:
            self.face_verification_thread.join(timeout=2)
        print("AI Engine: Face verification thread stopped.")
    
    def _face_verification_worker(self):
        """백그라운드에서 실행되는 얼굴 인증 워커"""
        while self.face_verification_running:
            try:
                # 큐에서 프레임 가져오기 (타임아웃 0.5초)
                if not self.face_verification_queue.empty():
                    frame = self.face_verification_queue.get(timeout=0.5)
                    
                    # 얼굴 인증 실행
                    is_verified, is_present = self._verify_registered_user_internal(frame)
                    
                    # 결과 저장 (스레드 안전)
                    with self.face_verification_lock:
                        self.face_verification_result = {
                            "verified": is_verified,
                            "present": is_present
                        }
                else:
                    time.sleep(0.1)
                    
            except Exception as e:
                print(f"Face verification worker error: {e}")
                time.sleep(0.1)
        
    def _verify_registered_user_internal(self, frame):
        """
        내부에서 사용하는 얼굴 인증 (스레드에서 실행)
        Returns:
            (is_registered_user: bool, is_someone_present: bool)
        """
        if not self.is_face_registered or self.registered_face_embedding is None:
            return True, True
        
        try:
            # 현재 프레임에서 얼굴 임베딩 추출
            embedding_objs = DeepFace.represent(
                img_path=frame,
                model_name="Facenet512",
                detector_backend='opencv',
                enforce_detection=False
            )
            
            if not embedding_objs or len(embedding_objs) == 0:
                # 얼굴이 감지되지 않음
                return False, False
            
            # 현재 얼굴의 임베딩 벡터
            current_embedding = np.array(embedding_objs[0]["embedding"])
            
            # 등록된 벡터와 비교 (코사인 거리)
            distance = self._cosine_distance(self.registered_face_embedding, current_embedding)
            
            print(f"Face verification distance: {distance:.4f} (threshold: {self.face_distance_threshold})")
            
            if distance < self.face_distance_threshold:
                # 등록된 사용자 확인
                return True, True
            else:
                # 다른 사람
                return False, True
                    
        except Exception as e:
            print(f"Face verification error: {e}")
            return False, False
        
    def register_user_face(self, frame):
        """
        사용자 얼굴을 등록 - 벡터(임베딩)로 저장
        Args:
            frame: OpenCV BGR 이미지
        Returns:
            (success: bool, message: str)
        """
        try:
            # 1. 얼굴 감지
            faces = DeepFace.extract_faces(
                img_path=frame,
                detector_backend='opencv',
                enforce_detection=True
            )
            
            if len(faces) == 0:
                return False, "얼굴이 감지되지 않았습니다. 카메라를 정면으로 봐주세요."
            elif len(faces) > 1:
                return False, "여러 명의 얼굴이 감지되었습니다. 혼자 있을 때 등록해주세요."
            
            # 2. 얼굴 임베딩(벡터) 추출
            embedding_objs = DeepFace.represent(
                img_path=frame,
                model_name="Facenet512",
                detector_backend='opencv',
                enforce_detection=True
            )
            
            if not embedding_objs or len(embedding_objs) == 0:
                return False, "얼굴 특징 추출에 실패했습니다."
            
            # 3. 임베딩 벡터 저장 (512차원 numpy array)
            embedding = np.array(embedding_objs[0]["embedding"])
            self.registered_face_embedding = embedding
            
            # 4. 파일로 저장
            if self._save_face_embedding(embedding):
                self.is_face_registered = True
                
                # 백그라운드 스레드 시작
                self._start_face_verification_thread()
                
                print("AI Engine: User face registered successfully as embedding vector.")
                return True, f"얼굴이 성공적으로 등록되었습니다! (벡터 크기: {len(embedding)})"
            else:
                return False, "벡터 저장에 실패했습니다."
            
        except Exception as e:
            print(f"Face registration error: {e}")
            return False, f"얼굴 등록 실패: {str(e)}"
    
    def delete_registered_face(self):
        """등록된 얼굴 삭제"""
        try:
            # 백그라운드 스레드 정지
            self._stop_face_verification_thread()
            
            if os.path.exists(self.face_embedding_path):
                os.remove(self.face_embedding_path)
            self.registered_face_embedding = None
            self.is_face_registered = False
            self.unknown_person_consecutive_frames = 0
            
            # 결과 초기화
            with self.face_verification_lock:
                self.face_verification_result = {"verified": True, "present": True}
            
            print("AI Engine: Face embedding deleted.")
            return True, "등록된 얼굴이 삭제되었습니다."
        except Exception as e:
            return False, f"삭제 실패: {str(e)}"
    
    def _cosine_distance(self, vec1, vec2):
        """두 벡터 간의 코사인 거리 계산"""
        return 1 - np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
        
    def load_user_stats(self, daily_stats_data: dict):
        if not daily_stats_data:
            print("AI Engine: No existing stats data. Starting fresh.")
            daily_stats_data = {}
            
        self.current_daily_study_time = daily_stats_data.get("daily_study_seconds", 0.0) 
        self.drowsy_count = daily_stats_data.get("daily_drowsy_count", 0)
        self.phone_count = daily_stats_data.get("daily_phone_count", 0)
        self.away_count = daily_stats_data.get("daily_away_count", 0)
        self.lying_down_count = daily_stats_data.get("daily_lying_down_count", 0)
        
        self.drowsy_seconds = daily_stats_data.get("daily_drowsy_seconds", 0.0)
        self.phone_seconds = daily_stats_data.get("daily_phone_seconds", 0.0)
        self.away_seconds = daily_stats_data.get("daily_away_seconds", 0.0)
        self.lying_down_seconds = daily_stats_data.get("daily_lying_down_seconds", 0.0)

        print(f"AI Engine: Daily stats loaded. Today's study time starting from: {self.current_daily_study_time}s")
        
        self.session_start_daily_stats = {
            "study_seconds": self.current_daily_study_time,
            "drowsy_count": self.drowsy_count,
            "phone_count": self.phone_count,
            "away_count": self.away_count,
            "lying_down_count": self.lying_down_count,
            "daily_drowsy_seconds": self.drowsy_seconds,
            "daily_phone_seconds": self.phone_seconds,
            "daily_away_seconds": self.away_seconds,
            "daily_lying_down_seconds": self.lying_down_seconds
        }

        self.drowsy_event_counted, self.phone_event_counted, self.away_event_counted, self.lying_down_event_counted = False, False, False, False
        self.current_status = "Initializing"
        self.study_session_start_time = None
        self.is_timer_running = False
        self.is_studying = False
        self.is_drowsy = False
        self.is_phone_visible = False
        self.is_looking_down = False
        self.is_using_phone = False
        self.is_person_present = True 
        self.is_lying_down = False
        self.drowsy_counter = 0
        self.phone_detected_start_time = None
        self.person_not_detected_start_time = None
        self.head_down_start_time = None

        self.initial_shoulder = None
        self.is_calibrating = True
        self.calibration_frames = []
        self.current_non_study_state = None
        self.non_study_start_time = None
        

    def commit_all_running_timers(self):
        current_time = time.time()
        
        # 1. 공부 타이머 확정
        if self.is_timer_running and self.study_session_start_time:
            elapsed = current_time - self.study_session_start_time
            self.current_daily_study_time += elapsed
            self.study_session_start_time = current_time 

        # 2. 비-공부 타이머 확정
        if self.current_non_study_state is not None and self.non_study_start_time is not None:
            self._stop_non_study_timer(current_time)

    def get_final_stats(self) -> (dict, dict):  # type: ignore
        final_daily_stats = {
            "daily_study_seconds": self.current_daily_study_time, 
            "daily_drowsy_count": self.drowsy_count,
            "daily_phone_count": self.phone_count,
            "daily_away_count": self.away_count,
            "daily_lying_down_count": self.lying_down_count,
            "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "daily_drowsy_seconds": self.drowsy_seconds,
            "daily_phone_seconds": self.phone_seconds,
            "daily_away_seconds": self.away_seconds,
            "daily_lying_down_seconds": self.lying_down_seconds
        }

        session_delta_stats = {
            "study_seconds": self.current_daily_study_time - self.session_start_daily_stats.get("study_seconds", 0.0),
        }

        return final_daily_stats, session_delta_stats

    def _euclidean_distance(self, p1, p2):
        return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

    def _get_ear(self, landmarks, indices):
        try:
            v1 = self._euclidean_distance(landmarks[indices[1]], landmarks[indices[5]])
            v2 = self._euclidean_distance(landmarks[indices[2]], landmarks[indices[4]])
            h = self._euclidean_distance(landmarks[indices[0]], landmarks[indices[3]])
            return (v1 + v2) / (2.0 * h) if h > 0 else 0.0
        except: return 0.0

    def _analyze_yolo_and_face(self, frame):
        """YOLO 객체 감지 + DeepFace 얼굴 인식 (백그라운드)"""
        phone_found = False
        
        # YOLO로 휴대폰 감지
        if self.yolo_model:
            results = self.yolo_model(frame, verbose=False)
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    if cls_id == self.PHONE_CLASS_ID and conf > self.PHONE_CONF_THRESHOLD:
                        phone_found = True
                        break
        
        current_time = time.time()
        
        # 휴대폰 감지 시간 체크
        if phone_found:
            if self.phone_detected_start_time is None: 
                self.phone_detected_start_time = current_time
            elif current_time - self.phone_detected_start_time > self.PHONE_DETECT_SECONDS: 
                self.is_phone_visible = True
        else:
            self.phone_detected_start_time = None
            self.is_phone_visible = False
        
        # 얼굴 인증 - 백그라운드 스레드에 프레임 전달
        self.frame_count += 1
        if self.is_face_registered and self.frame_count % self.face_verification_interval == 0:
            # 큐가 비어있으면 새 프레임 추가 (가득 차있으면 스킵)
            if self.face_verification_queue.empty():
                try:
                    self.face_verification_queue.put_nowait(frame.copy())
                except:
                    pass  # 큐가 가득 차면 스킵
        
        # 백그라운드 스레드의 최신 결과 가져오기
        with self.face_verification_lock:
            is_registered_user = self.face_verification_result["verified"]
            is_someone_present = self.face_verification_result["present"]
        
        if not is_someone_present:
            if self.person_not_detected_start_time is None: 
                self.person_not_detected_start_time = current_time
            elif current_time - self.person_not_detected_start_time > self.AWAY_DETECT_SECONDS: 
                self.is_person_present = False
        else:
            if is_registered_user:
                self.person_not_detected_start_time = None
                self.is_person_present = True
                self.unknown_person_consecutive_frames = 0
            else:
                # 다른 사람 감지
                self.unknown_person_consecutive_frames += 1
                if self.unknown_person_consecutive_frames > self.unknown_person_frame_threshold:
                    self.is_person_present = False

    def _analyze_face_and_head(self, rgb_frame):
        current_time = time.time() 
        
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
            
            if self.head_tilt_ratio < self.HEAD_TILT_RATIO_THRESHOLD and self.head_tilt_ratio >= 0:
                if self.head_down_start_time is None: 
                    self.head_down_start_time = current_time
                elif current_time - self.head_down_start_time > self.HEAD_DOWN_SECONDS: 
                    self.is_looking_down = True
            else:
                self.head_down_start_time = None; self.is_looking_down = False
        
        else:
            self.drowsy_counter = 0
            if self.head_down_start_time is not None:
                if current_time - self.head_down_start_time > self.HEAD_DOWN_SECONDS:
                    self.is_looking_down = True
            else:
                self.is_looking_down = False
                
            self.head_tilt_ratio = 0

    def _calibrate_posture(self, pose_results):
        if pose_results.pose_landmarks:
            landmarks = pose_results.pose_landmarks.landmark
            shoulder = landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER]          # type: ignore
            nose = landmarks[mp.solutions.pose.PoseLandmark.NOSE]                       # type: ignore
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
            current_shoulder_y = landmarks[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER].y # type: ignore
            current_nose_y = landmarks[mp.solutions.pose.PoseLandmark.NOSE].y              # type: ignore
            is_shoulder_down = current_shoulder_y > self.initial_shoulder['y'] + 0.1
            is_nose_down = current_nose_y > self.initial_shoulder['nose_y'] + 0.15
            self.is_lying_down = is_shoulder_down and is_nose_down
        else: self.is_lying_down = False
    
    def _update_status_and_timers(self):
        self.is_using_phone = self.is_phone_visible or self.is_looking_down
        self.is_studying = self.is_person_present and not self.is_using_phone and not self.is_drowsy and not self.is_lying_down
        
        current_time = time.time()
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
            if self.is_drowsy:
                new_state = "drowsy"
                self.current_status = "Drowsy"
            elif self.is_using_phone:
                new_state = "phone"
                self.current_status = "Using Phone"
            elif not self.is_person_present:
                new_state = "away"
                self.current_status = "Away"
            elif self.is_lying_down:
                new_state = "lying_down"
                self.current_status = "Lying Down"
            else:
                new_state = "idle" 
                self.current_status = "Calibrating" if self.is_calibrating else "Idle"

            if new_state != self.current_non_study_state:
                if self.current_non_study_state is not None:
                    self._stop_non_study_timer(current_time)
                
                self.current_non_study_state = new_state
                if new_state != "idle": 
                    self.non_study_start_time = current_time

                    if new_state == "drowsy" and not self.drowsy_event_counted: 
                        self.drowsy_count += 1; self.drowsy_event_counted = True
                    if new_state == "phone" and not self.phone_event_counted: 
                        self.phone_count += 1; self.phone_event_counted = True
                    if new_state == "away" and not self.away_event_counted: 
                        self.away_count += 1; self.away_event_counted = True
                    if new_state == "lying_down" and not self.lying_down_event_counted: 
                        self.lying_down_count += 1; self.lying_down_event_counted = True

        if self.is_studying:
            self.drowsy_event_counted = self.phone_event_counted = self.away_event_counted = self.lying_down_event_counted = False
    
    def _stop_non_study_timer(self, end_time):
        if self.non_study_start_time is None:
            return 

        elapsed = end_time - self.non_study_start_time
        
        if self.current_non_study_state == "drowsy":
            self.drowsy_seconds += elapsed
        elif self.current_non_study_state == "phone":
            self.phone_seconds += elapsed
        elif self.current_non_study_state == "away":
            self.away_seconds += elapsed
        elif self.current_non_study_state == "lying_down":
            self.lying_down_seconds += elapsed
            
        self.non_study_start_time = None
        self.current_non_study_state = None
    
    def _draw_overlay(self, frame):
        h, w, _ = frame.shape
        display_time_sec = self.current_daily_study_time
        if self.is_timer_running and self.study_session_start_time:
            display_time_sec += (time.time() - self.study_session_start_time)
        hours, rem = divmod(display_time_sec, 3600)
        minutes, seconds = divmod(rem, 60)
        timer_text = f"{int(hours):02}:{int(minutes):02}:{int(seconds):02}"
        
        status_color = (0, 255, 0) if self.is_studying else (0, 0, 255)
        cv2.putText(frame, f"Status: {self.current_status}", (10, h - 40), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)
        cv2.putText(frame, f"Study Time: {timer_text}", (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 1, status_color, 2)

        cv2.putText(frame, f"Head Tilt Ratio: {self.head_tilt_ratio:.2f}", (w - 300, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

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
        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape
        self._analyze_yolo_and_face(frame)
        self._analyze_face_and_head(rgb_frame)
        pose_results = self.mp_pose.process(rgb_frame)
        
        if self.is_calibrating:
            self._calibrate_posture(pose_results)
            cv2.putText(frame, "Calibrating... Stay Still", (w // 2 - 200, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        else:
            self._analyze_posture(pose_results)
            self._update_status_and_timers()
            self._draw_overlay(frame)
        return frame

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
                "phone": self.phone_count,
                "away": self.away_count,
                "lying_down": self.lying_down_count,
                "drowsy_seconds": self.drowsy_seconds,
                "phone_seconds": self.phone_seconds,
                "away_seconds": self.away_seconds
            }
        }
        
try:
    ai_engine_instance = AIEngine()
except Exception as e:
    print(f"Failed to initialize AIEngine: {e}")
    ai_engine_instance = None

def get_current_stats():
    if ai_engine_instance:
        return ai_engine_instance.get_state_for_main_py()
    else:
        return {
            "total_study_seconds": 0.0,
            "study_session_start_time": None,
            "is_timer_running": False,
            "current_status": "Error: Engine Failed",
            "counts": {"drowsy": 0, "phone": 0, "away": 0, "lying_down": 0}
        }

def generate_frames():
    
    if ai_engine_instance is None or ai_engine_instance.yolo_model is None:
        print("Error: AI Engine or YOLO model not loaded. Exiting frame generation.")
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
            
            processed_frame = ai_engine_instance.process(frame)

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