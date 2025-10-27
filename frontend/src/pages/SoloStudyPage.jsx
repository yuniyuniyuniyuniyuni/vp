// src/pages/SoloStudyPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function SoloStudyPage() {
  const videoFeedUrl = "http://localhost:8000/video_feed";
  // [수정] wsStatsUrl을 useEffect 안에서 동적으로 생성
  
  const [studyTime, setStudyTime] = useState("00:00:00");
  const [currentStatus, setCurrentStatus] = useState("Initializing");
  const [stats, setStats] = useState({ /* ... */ });
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  // [수정] 웹소켓 연결 useEffect
  useEffect(() => {
    // 1. localStorage에서 토큰 가져오기
    const token = localStorage.getItem('authToken');
    
    // 비로그인 사용자는 /study 접근 시 홈으로 보냄 (솔로 스터디도 로그인 필수로 변경)
    // (만약 비로그인 솔로 스터디를 허용하려면 로직이 복잡해집니다)
    if (!token) {
        console.error("No auth token found, redirecting to home.");
        navigate('/');
        return; 
    }

    // 2. 토큰을 포함하여 WebSocket URL 생성
    const wsStatsUrl = `ws://localhost:8000/ws_stats?token=${token}`;
    
    const ws = new WebSocket(wsStatsUrl);

    ws.onopen = () => console.log("WebSocket connected");
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.time) setStudyTime(data.time);
        if (data.status) setCurrentStatus(data.status);
        if (data.counts) {
           // 6. (선택) lying_down을 포함하여 stats를 안전하게 업데이트
           setStats(prevStats => ({
            ...prevStats,
            ...data.counts
          }));
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message", e);
      }
    };
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setCurrentStatus("Error");
    };
    ws.onclose = () => {
      console.log("WebSocket disconnected");
      if (event.code === 1008) { // 1008: Policy Violation (Invalid token)
        setCurrentStatus("Auth Error");
        navigate('/'); // 토큰 오류 시 홈으로
      } else {
        setCurrentStatus("Disconnected");
      }
    };
    return () => ws.close();
}, [navigate]); // navigate를 의존성 배열에 추가

  // ... (로그인 상태 확인 useEffect 및 나머지 코드는 기존과 동일) ...
  useEffect(() => {
    const dataString = localStorage.getItem('userData');
    if (dataString) {
      setUserData(JSON.parse(dataString));
    }
  }, []);

  // 8. 로그아웃 핸들러
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    navigate('/'); // 로그아웃 후 홈으로 이동
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

          {/* 11. "나가기" 버튼을 "뒤로가기" 버튼으로 변경 (항상 표시됨) */}
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