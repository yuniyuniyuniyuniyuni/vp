// src/pages/SoloStudyPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import { supabase } from '../supabaseClient'; 

function SoloStudyPage() {
  const videoFeedUrl = "http://localhost:8000/video_feed";

  const [studyTime, setStudyTime] = useState("00:00:00");
  const [currentStatus, setCurrentStatus] = useState("Initializing");
  const [stats, setStats] = useState({
    drowsy: 0,
    phone: 0,
    away: 0,
    lying_down: 0 
  });

  const [userData, setUserData] = useState(null);
  const navigate = useNavigate(); 

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
          if (data.counts) {
             setStats(prevStats => ({ ...prevStats, ...data.counts }));
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
    navigate(-1);
  };

  const statusClassName = `status-${currentStatus.replace(/\s+/g, '')}`;

  return (
    <div className="page-layout-sidebar">
      <header className="solo-header">
        <Link to="/" className="logo">
          NODOZE
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

          <button onClick={handleGoBack} className="btn btn-primary">
            뒤로가기
          </button>
        </aside>
        <main className="solo-main">
          <div className="video-feed">
            <img src={videoFeedUrl} alt="AI Monitor Feed" />
          </div>

          <div className="daily-stats-card">
            <h2 className="card-title">일일 통계</h2>
            
            <div className="stats-grid">
              <div className="stats-grid-item">
                <p className="stat-value">{stats.away} <span>회</span></p>
                <p className="stat-label">자리 비움</p>
              </div>
              <div className="stats-grid-item">
                <p className="stat-value">{stats.phone} <span>회</span></p>
                <p className="stat-label">휴대폰/숙임</p>
              </div>
              <div className="stats-grid-item">
                <p className="stat-value">{stats.drowsy} <span>회</span></p>
                <p className="stat-label">졸음 감지</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SoloStudyPage;