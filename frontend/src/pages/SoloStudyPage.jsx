// src/pages/SoloStudyPage.jsx (수정된 전체 파일)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

const API_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000";

const formatNonStudyTime = (seconds) => {
  if (!seconds) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}분 ${secs}초`;
};

function SoloStudyPage() {
  const [studyTime, setStudyTime] = useState("00:00:00");
  const [totalStudySecondsNum, setTotalStudySecondsNum] = useState(0); 
  const [currentStatus, setCurrentStatus] = useState("Initializing");

  const [stats, setStats] = useState({
    drowsy: 0,
    away: 0,
    lying_down: 0,
    leaning_back: 0,
    looking_away: 0,
    drowsy_seconds: 0,
    away_seconds: 0,
    lying_down_seconds: 0,
    leaning_back_seconds: 0,
    looking_away_seconds: 0
  });

  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();
  const [mainActiveTab, setMainActiveTab] = useState('video');
  const [todos, setTodos] = useState([]);
  const [newTodoText, setNewTodoText] = useState("");

  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  
  const [warningAudio] = useState(new Audio('/warning.mp3'));
  
  const prevStatusRef = useRef("Initializing");

  const videoRef = useRef(null); 
  const wsRef = useRef(null); 
  const canvasRef = useRef(null); 
  const isWsOpenRef = useRef(false); 

  const sendFrame = useCallback(() => {
    if (!isWsOpenRef.current || !videoRef.current || videoRef.current.readyState < 3) {
      return;
    }
    
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
    }
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    canvasRef.current.toBlob(
      (blob) => {
        if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(blob);
        } else if (!isWsOpenRef.current) {
          console.log("Frame captured but WebSocket is closed. Stopping send loop.");
        }
      },
      'image/jpeg',
      0.9 
    );
  }, []); 


  useEffect(() => {
    let streamCache = null; 

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 },
          audio: false 
        });
        streamCache = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play(); 
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        alert("카메라 접근에 실패했습니다. 브라우저의 카메라 권한을 확인해주세요.");
        setCurrentStatus("Camera Error");
      }
    };

    const connectWebSocket = async () => {
      let token = null;
      let wsStatsUrl;
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session) {
        token = session.access_token;
        wsStatsUrl = `${WS_URL}/ws_stats?token=${token}`; 
        console.log("Connecting WebSocket with Supabase token...");
      } else {
        wsStatsUrl = `${WS_URL}/ws_stats`; 
        console.log("Connecting WebSocket as anonymous...");
      }

      const ws = new WebSocket(wsStatsUrl);
      wsRef.current = ws; 

      ws.onopen = () => {
        console.log("WebSocket connected");
        isWsOpenRef.current = true;
        sendFrame(); 
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.time) setStudyTime(data.time);
          if (data.status) setCurrentStatus(data.status); 
          if (data.stats) {
            setStats(prevStats => ({ ...prevStats, ...data.stats }));
          }
          if (data.total_study_seconds !== undefined) {
            setTotalStudySecondsNum(data.total_study_seconds);
          }
          sendFrame();
        } catch (e) { console.error("Failed to parse WebSocket message", e); }
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setCurrentStatus("Error");
      };
      
      ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event.reason);
        isWsOpenRef.current = false; 
        
        if (event.code === 1008) { 
          setCurrentStatus("Auth Error");
          alert("인증이 만료되었습니다. 다시 로그인해주세요.");
          navigate('/');
        } else {
          setCurrentStatus("Disconnected");
        }
      };
    };

    startWebcam();
    connectWebSocket();

    return () => {
      isWsOpenRef.current = false; 
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (streamCache) {
        streamCache.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
    };
  }, [navigate, sendFrame]); 

  useEffect(() => {
    const nonStudyStates = [
      "Lying Down", 
      "Drowsy (Chin)", 
      "Drowsy (Eyes)", 
      "Looking Away",
      "Leaning Back", 
      "Away (Unknown Person)", 
      "Away (Not Detected)"
    ];

    const isNonStudy = nonStudyStates.includes(currentStatus);
    
    const wasStudyingOrIdle = !nonStudyStates.includes(prevStatusRef.current) && prevStatusRef.current !== "Calibrating" && prevStatusRef.current !== "Initializing";

    let message = "";
    if (isNonStudy) {
      switch (currentStatus) {
        case "Lying Down":
          message = "💤 엎드려 있습니다! 허리를 펴주세요.";
          break;
        case "Drowsy (Chin)":
          message = "😪 턱을 괴고 있습니다! 집중하세요!";
          break;
        case "Drowsy (Eyes)":
          message = "😴 졸고 있습니다! 정신 차리세요!";
          break;
        case "Looking Away":
          message = "👀 시선이 이탈했습니다! 화면에 집중하세요.";
          break;
        case "Leaning Back":
          message = "🧘 뒤로 기대고 있습니다. 바른 자세를 유지하세요.";
          break;
        case "Away (Unknown Person)":
          message = "🤔 다른 사람이 감지되었습니다. 자리를 비운 것으로 처리됩니다.";
          break;
        case "Away (Not Detected)":
          message = "🏃‍♂️ 자리를 비웠습니다. 타이머가 중지됩니다.";
          break;
        default:
          message = "🚨 집중력이 저하되었습니다!";
      }
    }

    if (isNonStudy && wasStudyingOrIdle && !showWarning) {
      setWarningMessage(message);
      setShowWarning(true);
      
      if (!isSoundMuted) {
        warningAudio.currentTime = 0;
        warningAudio.play().catch(e => console.error("Audio play failed:", e));
      }
    } 
    
    prevStatusRef.current = currentStatus;

  }, [currentStatus, isSoundMuted, showWarning, warningAudio]); 

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserData({
          name: user.user_metadata.name || user.email,
          picture: user.user_metadata.picture,
          email: user.email
        });
      }
    };
    fetchUserData();
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error.message);
    } else {
      setUserData(null);
      navigate('/');
    }
  };

  const handleGoBack = () => {
    navigate('/');
  };

  const [registrationStatus, setRegistrationStatus] = useState('');

  const handleRegisterFace = async () => {
    if (!videoRef.current || videoRef.current.readyState < 3) {
      alert("카메라가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    
    setRegistrationStatus('등록 중... 현재 프레임 캡처 중...');
    
    if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) {
        alert("❌ 프레임 캡처에 실패했습니다.");
        setRegistrationStatus('캡처 실패');
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'face.jpg');

      setRegistrationStatus('서버로 전송 중...');
      
      try {
        const response = await fetch(`${API_URL}/api/register-face`, { 
          method: "POST",
          body: formData, 
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
          alert("✅ 얼굴 등록 성공!");
          setRegistrationStatus('등록됨');
        } else {
          const errorMessage = data.detail || data.message || "알 수 없는 오류";
          alert(`❌ 얼굴 등록 실패:\n\n${errorMessage}`);
          setRegistrationStatus(`등록 실패: ${errorMessage}`);
        }
      } catch (err) {
        console.error("얼굴 등록 API 호출 오류:", err);
        alert("❌ 서버 연결에 실패했습니다.");
        setRegistrationStatus('API 호출 오류');
      }
    }, 'image/jpeg', 0.9); 
  };

  const handleDeleteFace = async () => {
    if (!confirm("정말로 등록된 얼굴을 삭제하시겠습니까?")) {
      return;
    }
    setRegistrationStatus('삭제 중...');
    try {
      const response = await fetch(`${API_URL}/api/delete-face`, { 
        method: "DELETE",
      });
      const data = await response.json();
      
      if (data.success) {
        alert("✅ 얼굴 삭제 성공!");
        setRegistrationStatus('등록되지 않음');
      } else {
        alert(`❌ 얼굴 삭제 실패:\n\n${data.message}`);
        setRegistrationStatus(`삭제 실패: ${data.message}`);
      }
    } catch (err) {
      console.error("얼굴 삭제 API 호출 오류:", err);
      alert("❌ 서버 연결에 실패했습니다.");
      setRegistrationStatus('API 호출 오류');
    }
  };

  useEffect(() => {
    const checkFaceStatus = async () => {
      setTimeout(async () => {
        if (!isWsOpenRef.current) {
          console.log("WS not connected. Skipping face status check.");
          setRegistrationStatus('WS 연결 실패');
          return;
        }
        try {
          const response = await fetch(`${API_URL}/api/check-face-registered`); 
          const data = await response.json();
          setRegistrationStatus(data.registered ? '등록됨' : '등록되지 않음');
        } catch (err) {
          setRegistrationStatus('확인 실패');
        }
      }, 3000); 
    };
    checkFaceStatus();
  }, []); 

  const handleAddNewTodo = (e) => {
    e.preventDefault();
    const text = newTodoText.trim();
    if (text) {
      setTodos(prevTodos => [...prevTodos, { id: Date.now(), text: text }]);
      setNewTodoText("");
    }
  };

  const handleRemoveTodo = (idToRemove) => {
    setTodos(prevTodos => prevTodos.filter(todo => todo.id !== idToRemove));
  };

  const studyLabel = '순수 공부시간';
  const studyColor = '#a7f3d0';
  const studyBorderColor = '#059669';
  const nonStudyLabels = {
    away_seconds: '자리 비움',
    drowsy_seconds: '졸음/턱괴기',
    lying_down_seconds: '엎드림',
    leaning_back_seconds: '뒤로 기댐',
    looking_away_seconds: '시선 이탈'
  };
  const nonStudyColors = {
    away_seconds: '#e5e7eb',
    drowsy_seconds: '#fef3c7',
    lying_down_seconds: '#fee2e2',
    leaning_back_seconds: '#ffe4e6',
    looking_away_seconds: '#fed7aa'
  };
  const nonStudyBorderColors = {
    away_seconds: '#9ca3af',
    drowsy_seconds: '#92400e',
    lying_down_seconds: '#991b1b',
    leaning_back_seconds: '#9f1239',
    looking_away_seconds: '#9a3412'
  };
  
  const totalNonStudyTime =
    (stats.away_seconds || 0) +
    (stats.drowsy_seconds || 0) +
    (stats.lying_down_seconds || 0) +
    (stats.leaning_back_seconds || 0) +
    (stats.looking_away_seconds || 0);
  const totalTrackedTime = (totalStudySecondsNum || 0) + totalNonStudyTime;
  
  const pieChartData = {
    labels: [
      studyLabel, 
      nonStudyLabels.away_seconds,
      nonStudyLabels.drowsy_seconds,
      nonStudyLabels.lying_down_seconds,
      nonStudyLabels.leaning_back_seconds,
      nonStudyLabels.looking_away_seconds
    ],
    datasets: [
      {
        label: '시간',
        data: [
          totalStudySecondsNum || 0, 
          stats.away_seconds || 0,
          stats.drowsy_seconds || 0,
          stats.lying_down_seconds || 0,
          stats.leaning_back_seconds || 0,
          stats.looking_away_seconds || 0
        ],
        backgroundColor: [
          studyColor, 
          nonStudyColors.away_seconds,
          nonStudyColors.drowsy_seconds,
          nonStudyColors.lying_down_seconds,
          nonStudyColors.leaning_back_seconds,
          nonStudyColors.looking_away_seconds
        ],
        borderColor: [
          studyBorderColor, 
          nonStudyBorderColors.away_seconds,
          nonStudyBorderColors.drowsy_seconds,
          nonStudyBorderColors.lying_down_seconds,
          nonStudyBorderColors.leaning_back_seconds,
          nonStudyBorderColors.looking_away_seconds
        ],
        borderWidth: 1,
      },
    ],
  };
  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false, 
    plugins: {
      legend: {
        position: 'right',
      },
      title: {
        display: true,
        text: '총 시간 비율', 
        font: {
          size: 16
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed !== null && totalTrackedTime > 0) { 
              const percentage = (context.parsed / totalTrackedTime * 100).toFixed(1);
              label += `${formatNonStudyTime(context.parsed)} (${percentage}%)`;
            } else if (context.parsed !== null) {
              label += `${formatNonStudyTime(context.parsed)} (0.0%)`;
            }
            return label;
          }
        }
      }
    },
  };
  
  const statusClassName = `status-${currentStatus.replace(/[\s()]/g, '')}`; 

  return (
    <div className={`page-layout-wrapper ${showWarning ? 'blurred' : ''}`}>
      <div className="page-layout-sidebar">
        <header className="solo-header">
          <Link to="/" className="logo">
            NO<span className="blue-doze">DOZE</span>
          </Link>
          <h1 className="header-title">
            AI 실시간 모니터링
          </h1>
        </header>

        <div className="page-body-sidebar">

          <aside className="sidebar">
            <div className="stats-card-time">
              <p className="card-label">오늘의 순공시간</p>
              <p className="card-value">{studyTime}</p>
            </div>
            <div className="stats-card-status">
              <p className="card-label">현재 상태</p>
              <span className={`status-badge ${statusClassName}`}>{currentStatus}</span>
            </div>
            <Link to='/ranking' className="btn-ranking">
              🏆 랭킹 보러가기
            </Link>

            <button 
              onClick={() => setIsSoundMuted(prev => !prev)}
              className="btn-sound-toggle"
              title={isSoundMuted ? "알림 소리 켜기" : "알림 소리 끄기"}
            >
              {isSoundMuted ? '🔇 알림음 꺼짐' : '🔊 알림음 켜짐'}
            </button>
            
            {userData && (
              <div className="profile-section">
                <div className="profile-info">
                  <div className="user-avatar">
                    {userData.picture ? 
                      <img src={userData.picture} alt="avatar" /> :
                      <div /> 
                    }
                  </div>
                  <div>
                    <div className="user-name">{userData.name}</div>
                    <button onClick={handleLogout} className="logout-link">
                      로그아웃
                    </button>
                  </div>
                </div>
              </div>
            )}    
            <div className="profile-section">
              <div className="profile-info face-auth">
                <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                  얼굴 인증 (선택)
                </div>
                <div className="face-auth-status">
                  현재 상태: {registrationStatus}
                </div>
                
                <div className="face-auth-buttons">
                  <button 
                    onClick={handleRegisterFace} 
                    className="btn btn-primary-sm btn-face-action" 
                    disabled={!isWsOpenRef.current || registrationStatus === '등록됨'} 
                  >
                    얼굴 등록하기
                  </button>
                  <button 
                    onClick={handleDeleteFace}
                    className="btn btn-primary-sm btn-face-action btn-delete" 
                    disabled={!isWsOpenRef.current || registrationStatus !== '등록됨'} 
                  >
                    등록 삭제
                  </button>
                </div>
                <p className="face-auth-note">
                  * 등록 시, 다른 사람이 화면 앞에 앉으면 '자리 비움'으로 처리됩니다.
                </p>
              </div>
            </div>              
            <div className='stats-footer-note'>
              <button onClick={handleGoBack} className="btn btn-primary">
                학습 종료
              </button>   
            </div>
          </aside>

          <main className="solo-main">
            <div className="tabs main-tabs-container">
              <button
                className={`tab-btn ${mainActiveTab === 'video' ? 'active' : ''}`}
                onClick={() => setMainActiveTab('video')}
              >
                실시간 비디오
              </button>
              <button
                className={`tab-btn ${mainActiveTab === 'stats' ? 'active' : ''}`}
                onClick={() => setMainActiveTab('stats')}
              >
                일일 통계
              </button>
              <button
                className={`tab-btn ${mainActiveTab === 'todo' ? 'active' : ''}`}
                onClick={() => setMainActiveTab('todo')}
              >
                To-Do List
              </button>
            </div>
            <div className="main-tab-content">
              <div className={`tab-content-item ${mainActiveTab === 'video' ? '' : 'hidden'}`}>
                <div className="video-feed">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="video-self-view" 
                  />
                  
                  {(currentStatus === "Initializing" || currentStatus === "Calibrating") && (
                    <div className="video-overlay">
                      <p>
                        {currentStatus === "Initializing" ? "AI 엔진 초기화 중..." : "자세 측정 중..."}
                      </p>
                      <p>
                        AI가 기본 자세를 측정하고 있습니다.<br />
                        가장 편안하고 바른 자세로 정면을 바라봐주세요.
                      </p>
                    </div>
                  )}

                  {currentStatus === "Camera Error" && (
                    <div className="video-overlay">
                      <p>카메라를 시작할 수 없습니다.</p>
                      <p>브라우저의 카메라 권한을 확인해주세요.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className={`tab-content-item ${mainActiveTab === 'stats' ? '' : 'hidden'}`}>
                <div className="daily-stats-card">
                  <div className="stats-and-chart-container">
                    <div className="stats-grid">
                      <div className="stats-grid-item">
                        <p className="stat-value">{(stats.away || 0)} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.away_seconds)}</p>
                        <p className="stat-label">자리 비움</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{(stats.drowsy || 0)} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.drowsy_seconds)}</p>
                        <p className="stat-label">졸음/턱괴기</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{(stats.lying_down || 0)} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.lying_down_seconds)}</p>
                        <p className="stat-label">엎드림</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{(stats.leaning_back || 0)} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.leaning_back_seconds)}</p>
                        <p className="stat-label">뒤로 기댐</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{(stats.looking_away || 0)} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.looking_away_seconds)}</p>
                        <p className="stat-label">시선 이탈</p>
                      </div>
                    </div>
                    <div className="pie-chart-container">
                      {totalTrackedTime > 0 ? (
                        <Pie data={pieChartData} options={pieChartOptions} />
                      ) : (
                        <div className="pie-chart-empty">
                          <p>기록된 시간이 없습니다.</p> 
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className={`tab-content-item ${mainActiveTab === 'todo' ? '' : 'hidden'}`}>
                <div className="daily-stats-card">
                  <div className="todo-list-container">
                    <h3 className="todo-title">✨ 오늘의 To-Do</h3>
                    <form onSubmit={handleAddNewTodo} className="todo-form">
                      <div className="todo-input-group">
                        <input
                          type="text"
                          value={newTodoText}
                          onChange={(e) => setNewTodoText(e.target.value)}
                          placeholder="새로운 할 일 (예: 수학 30페이지)"
                        />
                        <button type="submit" title="추가">➕</button>
                      </div>
                    </form>
                    <ul className="todo-list">
                      {todos.length === 0 ? (
                        <li className="todo-empty">
                          <p>👍</p>
                          모든 할 일을 완료했거나,
                          <br />
                          아직 추가된 할 일이 없습니다.
                        </li>
                      ) : (
                        todos.map(todo => (
                          <li key={todo.id} className="todo-item">
                            <span>{todo.text}</span>
                            <button 
                              onClick={() => handleRemoveTodo(todo.id)} 
                              className="todo-delete-btn"
                              title="삭제"
                            >
                              ✕ 
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {showWarning && (
        <div className="warning-overlay">
          <div className="warning-popup">
            <h3 className="warning-title">🚨 집중력 저하 감지!</h3>
            <p className="warning-message">{warningMessage}</p>
            <button 
              onClick={() => setShowWarning(false)} 
              className="btn btn-primary"
            >
              확인 (닫기)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SoloStudyPage;