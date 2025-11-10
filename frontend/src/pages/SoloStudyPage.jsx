// src/pages/SoloStudyPage.jsx

import React, { useState, useEffect, useRef } from 'react'; // [수정] useRef 추가
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// Chart.js 임포트
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';

// Chart.js 모듈 등록
ChartJS.register(ArcElement, Tooltip, Legend, Title);

const formatNonStudyTime = (seconds) => {
  if (!seconds) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}분 ${secs}초`;
};

function SoloStudyPage() {
  const videoFeedUrl = "http://localhost:8000/video_feed";

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

  // [추가] 팝업 및 알림음 상태
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  
  // [추가] Audio 객체 생성 (public 폴더에 warning.mp3 파일 필요)
  const [warningAudio] = useState(new Audio('/warning.mp3'));
  
  // [추가] 이전 상태 저장을 위한 Ref
  const prevStatusRef = useRef("Initializing");

  useEffect(() => {
    let ws;
    const connectWebSocket = async () => {
      let token = null;
      let wsStatsUrl;
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session) {
        token = session.access_token;
        wsStatsUrl = `ws://localhost:8000/ws_stats?token=${token}`;
        console.log("Connecting WebSocket with Supabase token...");
      } else {
        wsStatsUrl = `ws://localhost:8000/ws_stats`;
        console.log("Connecting WebSocket as anonymous...");
      }

      ws = new WebSocket(wsStatsUrl);

      ws.onopen = () => console.log("WebSocket connected");
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.time) setStudyTime(data.time);
          if (data.status) setCurrentStatus(data.status); // [수정] 이 값에 따라 알림이 트리거됨
          if (data.stats) {
            setStats(prevStats => ({ ...prevStats, ...data.stats }));
          }
          if (data.total_study_seconds !== undefined) {
            setTotalStudySecondsNum(data.total_study_seconds);
          }
        } catch (e) { console.error("Failed to parse WebSocket message", e); }
      };
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setCurrentStatus("Error");
      };
      ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event.reason);
        if (event.code === 1008) { // Invalid token
          setCurrentStatus("Auth Error");
          alert("인증이 만료되었습니다. 다시 로그인해주세요.");
          navigate('/');
        } else {
          setCurrentStatus("Disconnected");
        }
      };
    };

    connectWebSocket();
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [navigate]);

  // [추가] '딴짓' 감지 시 팝업 및 소리 알림을 위한 useEffect
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
    
    // 이전 상태가 '공부 중' 또는 '초기 상태'였는지 확인
    const wasStudyingOrIdle = !nonStudyStates.includes(prevStatusRef.current);

    let message = "";
    if (isNonStudy) {
      switch (currentStatus) {
        case "Lying Down":
          message = "💤 엎드려 있습니다! 허리를 펴주세요.";
          break;
        case "Drowsy (Chin)":
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

  // ... (handleLogout, handleGoBack, handleRegisterFace, handleDeleteFace, checkFaceStatus 함수는 변경 없음) ...
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

  // 1. 얼굴 등록 API 호출
  const handleRegisterFace = async () => {
    setRegistrationStatus('등록 중... 카메라를 정면으로 봐주세요.');
    try {
      const response = await fetch("http://localhost:8000/api/register-face", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        alert("✅ 얼굴 등록 성공!\n\nAI 엔진을 다시 시작하거나 페이지를 새로고침하면 적용됩니다.");
        setRegistrationStatus('등록됨');
      } else {
        alert(`❌ 얼굴 등록 실패:\n\n${data.message}`);
        setRegistrationStatus(`등록 실패: ${data.message}`);
      }
    } catch (err) {
      console.error("얼굴 등록 API 호출 오류:", err);
      alert("❌ 서버 연결에 실패했습니다.");
      setRegistrationStatus('API 호출 오류');
    }
  };

  // 2. 얼굴 삭제 API 호출
  const handleDeleteFace = async () => {
    if (!confirm("정말로 등록된 얼굴을 삭제하시겠습니까?")) {
      return;
    }
    setRegistrationStatus('삭제 중...');
    try {
      const response = await fetch("http://localhost:8000/api/delete-face", {
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

  // 3. 현재 얼굴 등록 상태 확인 (페이지 로드 시)
  useEffect(() => {
    const checkFaceStatus = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/check-face-registered");
        const data = await response.json();
        setRegistrationStatus(data.registered ? '등록됨' : '등록되지 않음');
      } catch (err) {
        setRegistrationStatus('확인 실패');
      }
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

  // ... (파이 차트 데이터 및 옵션은 변경 없음) ...
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
    stats.away_seconds +
    stats.drowsy_seconds +
    stats.lying_down_seconds +
    stats.leaning_back_seconds +
    stats.looking_away_seconds;
  const totalTrackedTime = totalStudySecondsNum + totalNonStudyTime;
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
          totalStudySecondsNum, 
          stats.away_seconds,
          stats.drowsy_seconds,
          stats.lying_down_seconds,
          stats.leaning_back_seconds,
          stats.looking_away_seconds
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
    // [추가] 팝업이 떴을 때 뒷 배경을 흐리게 하기 위한 div 추가 (선택 사항)
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

            {/* [추가] 알림음 켜기/끄기 버튼 */}
            <button 
              onClick={() => setIsSoundMuted(prev => !prev)}
              className="btn-sound-toggle"
              title={isSoundMuted ? "알림 소리 켜기" : "알림 소리 끄기"}
            >
              {isSoundMuted ? '🔇 알림음 꺼짐' : '🔊 알림음 켜짐'}
            </button>
            
            {userData && (
              <div className="profile-section">
                {/* ... (프로필 정보) ... */}
                <div className="profile-info">
                  <div className="user-avatar" style={{width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden'}}>
                    {userData.picture ? 
                      <img src={userData.picture} alt="avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} /> :
                      <div style={{width: '100%', height: '100%', background: '#eee'}}></div>
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
              {/* ... (얼굴 인증 섹션) ... */}
              <div className="profile-info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                  얼굴 인증 (선택)
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  현재 상태: {registrationStatus}
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={handleRegisterFace} 
                    className="btn-primary-sm" 
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                    disabled={registrationStatus === '등록됨'} 
                  >
                    얼굴 등록하기
                  </button>
                  <button 
                    onClick={handleDeleteFace}
                    className="btn-primary-sm" 
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#dc2626' }} 
                    disabled={registrationStatus !== '등록됨'} 
                  >
                    등록 삭제
                  </button>
                </div>
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0.5rem 0 0 0' }}>
                  * 등록 시, 다른 사람이 화면 앞에 앉으면 '자리 비움'으로 처리됩니다.
                </p>
              </div>
            </div>              
            <div className='stats-footer-note' style={{marginTop: 'auto'}}>
              <button onClick={handleGoBack} className="btn btn-primary">
                학습 종료
              </button>   
            </div>
          </aside>

          <main className="solo-main">
            {/* ... (메인 탭 및 컨텐츠) ... */}
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
              {mainActiveTab === 'video' ? (
                <div className="video-feed">
                  <img src={videoFeedUrl} alt="AI Monitor Feed" />
                </div>
              ) : mainActiveTab === 'stats' ? (
                <div className="daily-stats-card">
                  <div className="stats-and-chart-container">
                    {/* ... (통계 그리드) ... */}
                    <div className="stats-grid">
                      <div className="stats-grid-item">
                        <p className="stat-value">{stats.away} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.away_seconds)}</p>
                        <p className="stat-label">자리 비움</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{stats.drowsy} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.drowsy_seconds)}</p>
                        <p className="stat-label">졸음/턱괴기</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{stats.lying_down} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.lying_down_seconds)}</p>
                        <p className="stat-label">엎드림</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{stats.leaning_back} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.leaning_back_seconds)}</p>
                        <p className="stat-label">뒤로 기댐</p>
                      </div>
                      <div className="stats-grid-item">
                        <p className="stat-value">{stats.looking_away} <span>회</span></p>
                        <p className="stat-label-time">{formatNonStudyTime(stats.looking_away_seconds)}</p>
                        <p className="stat-label">시선 이탈</p>
                      </div>
                    </div>
                    {/* ... (파이 차트) ... */}
                    <div className="pie-chart-container" style={{ height: '400px', maxWidth: '550px' }}>
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
              ) : ( 
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
              )}
            </div>
          </main>
        </div>
      </div>

      {/* [추가] '딴짓' 경고 팝업 모달 */}
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