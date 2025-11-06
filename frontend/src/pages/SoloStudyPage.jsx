// src/pages/SoloStudyPage.jsx

import React, { useState, useEffect } from 'react';
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
  // [삭제] activeTab state 제거
  // const [activeTab, setActiveTab] = useState('stats'); 
  const [todos, setTodos] = useState([]);
  const [newTodoText, setNewTodoText] = useState("");

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
          if (data.status) setCurrentStatus(data.status);
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

  // [테마 1: 편안한 파스텔톤]
  const studyLabel = '순수 공부시간';
  const studyColor = '#a7f3d0'; // (편안한 민트색)
  const studyBorderColor = '#059669';

  const nonStudyLabels = {
    away_seconds: '자리 비움',
    drowsy_seconds: '졸음/턱괴기',
    lying_down_seconds: '엎드림',
    leaning_back_seconds: '뒤로 기댐',
    looking_away_seconds: '시선 이탈'
  };

  const nonStudyColors = {
    away_seconds: '#e5e7eb', // (연한 회색)
    drowsy_seconds: '#fef3c7', // (연한 노랑)
    lying_down_seconds: '#fee2e2', // (연한 빨강)
    leaning_back_seconds: '#ffe4e6', // (연한 분홍)
    looking_away_seconds: '#fed7aa'  // (연한 주황)
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
          {/* ... (사이드바 JSX는 변경 없음) ... */}
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
          {userData && (
            <div className="profile-section">
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
          {/* [수정] 3개의 메인 탭으로 변경 */}
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
            {/* [추가] To-Do List 탭 */}
            <button
              className={`tab-btn ${mainActiveTab === 'todo' ? 'active' : ''}`}
              onClick={() => setMainActiveTab('todo')}
            >
              To-Do List
            </button>
          </div>

          {/* [수정] 메인 컨텐츠 렌더링 로직 변경 */}
          <div className="main-tab-content">
            {mainActiveTab === 'video' ? (
              <div className="video-feed">
                <img src={videoFeedUrl} alt="AI Monitor Feed" />
              </div>
            ) : mainActiveTab === 'stats' ? (
              // '일일 통계' 탭 컨텐츠
              <div className="daily-stats-card">
                {/* [삭제] 중첩 탭 제거 */}
                <div className="stats-and-chart-container">
                  {/* 통계 그리드 */}
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

                  {/* 파이 차트 */}
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
              // 'To-Do List' 탭 컨텐츠 (mainActiveTab === 'todo')
              <div className="daily-stats-card">
                {/* [삭제] 중첩 탭 제거 */}
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
            
            {/* ... study-timeline 주석 ... */}
          </div>
        </main>
      </div>
    </div>
  );
}

export default SoloStudyPage;