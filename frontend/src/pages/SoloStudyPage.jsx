// src/pages/SoloStudyPage.jsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import { supabase } from '../supabaseClient'; 

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
  const [stats, setStats] = useState({
    drowsy: 0,
    phone: 0,
    away: 0,
    lying_down: 0,
    drowsy_seconds: 0,
    phone_seconds: 0,
    away_seconds: 0
  });

  const [userData, setUserData] = useState(null);
  const navigate = useNavigate(); 
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
        if (event.code === 1008) {
          setCurrentStatus("Auth Error");
          navigate('/');
        } else { setCurrentStatus("Disconnected"); }
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

  const statusClassName = `status-${currentStatus.replace(/\s+/g, '')}`;

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
                <div className="user-avatar">
                  {userData.picture && <img src={userData.picture} alt="avatar" />}
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
          <div className='stats-footer-note'>
            <button onClick={handleGoBack} className="btn btn-primary">
              뒤로가기
            </button>   
          </div>
        </aside>
        <main className="solo-main">
          <div className="video-feed">
            <img src={videoFeedUrl} alt="AI Monitor Feed" />
          </div>

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
              <div className="stats-grid">
                <div className="stats-grid-item">
                  <p className="stat-value">{stats.away} <span>회</span></p>
                  <p className="stat-label-time">{formatNonStudyTime(stats.away_seconds)}</p>
                  <p className="stat-label">자리 비움</p>
                </div>
                <div className="stats-grid-item">
                  <p className="stat-value">{stats.phone} <span>회</span></p>
                  <p className="stat-label-time">{formatNonStudyTime(stats.phone_seconds)}</p>
                  <p className="stat-label">휴대폰/숙임</p>
                </div>
                <div className="stats-grid-item">
                  <p className="stat-value">{stats.drowsy} <span>회</span></p>
                  <p className="stat-label-time">{formatNonStudyTime(stats.drowsy_seconds)}</p>
                  <p className="stat-label">졸음 감지</p>
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
        </main>
      </div>
    </div>
  );
}

export default SoloStudyPage;