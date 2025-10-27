// src/pages/SoloStudyPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom'; 
import { supabase } from '../supabaseClient'; // <-- Supabase 클라이언트 임포트

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

  // [수정] 웹소켓 연결 useEffect
  useEffect(() => {
    let ws; // 웹소켓 변수를 외부로 뺌
    
    // [수정] Supabase 세션을 비동기적으로 가져오는 함수
    const connectWebSocket = async () => {
      let token = null;
      let wsStatsUrl;

      // 1. Supabase 세션(로그인 상태)을 가져옴
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session) {
        // 2. 로그인 상태면 Supabase 토큰(Access Token) 사용
        token = session.access_token;
        wsStatsUrl = `ws://localhost:8000/ws_stats?token=${token}`;
        console.log("Connecting WebSocket with Supabase token...");
      } else {
        // 3. 비로그인 상태면 토큰 없이 연결
        wsStatsUrl = `ws://localhost:8000/ws_stats`;
        console.log("Connecting WebSocket as anonymous...");
      }
      
      ws = new WebSocket(wsStatsUrl);
      
      ws.onopen = () => console.log("WebSocket connected");
      ws.onmessage = (event) => {
        // ... (onmessage 로직 동일)
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
        if (event.code === 1008) { // 1008: Policy Violation (Invalid token)
          setCurrentStatus("Auth Error");
          navigate('/'); // 토큰 오류 시 홈으로
        } else { setCurrentStatus("Disconnected"); }
      };
    };

    connectWebSocket(); // 비동기 함수 실행

    // 컴포넌트 언마운트 시 웹소켓 연결 해제
    return () => {
      if (ws) {
        ws.close();
      }
    };

  }, [navigate]); // navigate를 의존성 배열에 추가

  // ... (로그인 상태 확인 useEffect 및 나머지 코드는 기존과 동일) ...
  useEffect(() => {
    // Supabase 세션에서 사용자 정보 가져오기
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserData({
          name: user.user_metadata.name || user.email, // Google 이름
          picture: user.user_metadata.picture, // Google 프로필 사진
          email: user.email
        });
      }
    };
    fetchUserData();
  }, []); 

  // [수정] 로그아웃 핸들러
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error.message);
    } else {
      setUserData(null); // 사용자 상태 비우기
      navigate('/'); // 로그아웃 후 홈으로 이동
    }
  };

  // 9. 뒤로가기 핸들러
  const handleGoBack = () => {
    navigate(-1); // 브라우저 히스토리에서 뒤로 한 칸 이동
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

        {/* 사이드바 */}
        <aside className="sidebar">
          {/* ... (순공시간, 현재 상태 카드) ... */}
          <div className="stats-card-time">
            <p className="card-label">오늘의 순공시간</p>
            <p className="card-value">{studyTime}</p>
          </div>
          <div className="stats-card-status">
            <p className="card-label">현재 상태</p>
            <span className={`status-badge ${statusClassName}`}>{currentStatus}</span>
          </div>
    {/* 10. 로그인 상태일 때만 사용자 정보와 로그아웃 버튼 표시 */}
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
          
          {/* --- [수정 완료] --- */}
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <main className="solo-main">

          {/* 웹캠 영상 */}
          <div className="video-feed">
            <img src={videoFeedUrl} alt="AI Monitor Feed" />
          </div>

          {/* 일일 통계 */}
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