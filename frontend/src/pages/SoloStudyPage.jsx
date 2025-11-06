// src/pages/SoloStudyPage.jsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import { supabase } from '../supabaseClient'; // 이 경로는 사용자의 프로젝트 구조에 따라 정확해야 합니다.

const formatNonStudyTime = (seconds) => {
  if (!seconds) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}분 ${secs}초`;
};

function SoloStudyPage() {
  const videoFeedUrl = "http://localhost:8000/video_feed";

  const [studyTime, setStudyTime] = useState("00:00:00");
  const [currentStatus, setCurrentStatus] = useState("Initializing");
  
  // [수정] 백엔드(v21.0)에서 보내주는 stats에 맞게 상태를 변경
  // 'phone'을 제거하고, 'lying_down', 'leaning_back', 'looking_away' 및 '_seconds' 항목들을 추가
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
  const [activeTab, setActiveTab] = useState('stats'); 
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
             // 백엔드가 보내주는 모든 stat을 한 번에 업데이트 (v21.0 호환)
             setStats(prevStats => ({ ...prevStats, ...data.stats }));
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

  const statusClassName = `status-${currentStatus.replace(/[\s()]/g, '')}`; // 괄호 제거

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
              
              {/* 버튼을 그룹으로 묶음 */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={handleRegisterFace} 
                  className="btn-primary-sm" 
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  disabled={registrationStatus === '등록됨'} // 이미 등록됐으면 비활성화
                >
                  얼굴 등록하기
                </button>
                <button 
                  onClick={handleDeleteFace}
                  className="btn-primary-sm" 
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#dc2626' }} // 빨간색
                  disabled={registrationStatus !== '등록됨'} // 등록 안됐으면 비활성화
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
          </div>
          <div className="main-tab-content">
            {mainActiveTab === 'video' ? (
              <div className="video-feed">
                <img src={videoFeedUrl} alt="AI Monitor Feed" />
              </div>
            ) : (
              <div className="daily-stats-card">
                <div className="tabs">
                  <button
                    className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                  >
                    일일 통계
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'todo' ? 'active' : ''}`}
                    onClick={() => setActiveTab('todo')}
                  >
                    To-Do List
                  </button>
                </div>

                {activeTab === 'stats' ? (
                  // [수정] 3개 항목에서 5개 항목으로 변경 (백엔드 v21.0 기준)
                  // App.css에서 .stats-grid의 컬럼 수를 5로 변경해야 합니다.
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
                ) : (
                  <div className="todo-list-container">
                    <form onSubmit={handleAddNewTodo} className="todo-form">
                      <input
                        type="text"
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        placeholder="오늘의 할 일"
                      />
                      <button type="submit">추가</button>
                    </form>
                    <ul className="todo-list">
                      {todos.length === 0 ? (
                        <li className="todo-empty">할 일이 없습니다.</li>
                      ) : (
                        todos.map(todo => (
                          <li key={todo.id} className="todo-item">
                            <button 
                              onClick={() => handleRemoveTodo(todo.id)} 
                              className="todo-check-btn"
                              title="완료 (제거)"
                            >
                              ✔️
                            </button>
                            <span>{todo.text}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {/* [주석 처리] study-timeline은 현재 구현되지 않았으므로 
              디자인에서 제외하거나 나중에 구현할 수 있습니다. 
            */}
            {/* <div className="study-timeline">
              <h2 className="section-title">학습 타임라인</h2>
            </div> */}
          </div>
        </main>
      </div>
    </div>
  );
}

export default SoloStudyPage;