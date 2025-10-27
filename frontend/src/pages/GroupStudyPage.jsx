// src/pages/GroupStudyPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * '다른 참여자' 수(1~9명)에 따라 최적의 그리드 클래스를 반환하는 함수
 * @param {number} count - '나'를 제외한 다른 참여자 수
 * @returns {string} - CSS 그리드 클래스 문자열
 */
const getGroupGridClasses = (count) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-3";
    if (count === 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 8) return "grid-cols-3";
    if (count === 9) return "grid-cols-3";
    if (count === 10) return "grid-cols-3"; // 10명 레이아웃 추가
    return "grid-cols-3"; // 기본값
};

/**
 * 웹캠 카드를 렌더링하는 컴포넌트
 * '나'일 경우 videoFeedUrl을 받아 실제 영상을 표시합니다.
 */
const WebcamCard = ({ name, status, isMe = false, videoFeedUrl }) => {
    
    let statusColorClass = 'status-green'; // 집중
    if (status === '자리 비움') statusColorClass = 'status-yellow';
    // ai_monitor.py의 상태 문자열(Using Phone, Drowsy 등)에 맞춰 '딴짓' 조건 확장
    if (status === 'Using Phone' || status === 'Drowsy' || status === 'Lying Down' || status === '딴짓' || status === '졸음') {
        statusColorClass = 'status-red';
    }

    const cardClass = isMe ? "webcam-card is-me" : "webcam-card";

    return (
        <div className={cardClass}>
            <div className="webcam-placeholder">
                {/* '나'일 경우 플레이스홀더 대신 img 태그(비디오 피드) 렌더링 */}
                {isMe ? (
                    <img src={videoFeedUrl} alt="My Webcam" className="webcam-video-feed" />
                ) : (
                    <span>MEMBER</span>
                )}
            </div>
            <div className="webcam-overlay">
                <span className="name">{name}{isMe && ' (나)'}</span>
                <span className={`status ${statusColorClass}`}>● {status}</span>
            </div>
        </div>
    );
};


function GroupStudyPage() {
    // --- 엔드포인트 ---
    const videoFeedUrl = "http://localhost:8000/video_feed";
    // wsStatsUrl은 useEffect 내에서 토큰과 함께 동적으로 생성됩니다.

    // --- AI 모니터링 상태 (웹소켓) ---
    const [studyTime, setStudyTime] = useState("00:00:00");
    const [currentStatus, setCurrentStatus] = useState("Initializing");
    const [stats, setStats] = useState({
        drowsy: 0,
        phone: 0,
        away: 0,
        lying_down: 0 // 눕기 감지 추가
    });

    // --- UI 상태 ---
    const [activeStatsTab, setActiveStatsTab] = useState('tab-personal-stats');
    const [mainViewTab, setMainViewTab] = useState('group');
    
    // --- 사용자 로그인 상태 ---
    const [userData, setUserData] = useState(null); 
    const navigate = useNavigate(); 

    // --- 1. 웹소켓 연결 (AI 모니터링 데이터 수신) ---
    useEffect(() => {
        // localStorage에서 토큰 가져오기
        const token = localStorage.getItem('authToken');
        
        // 토큰이 없으면 (로그인 안 했으면) 홈으로 리디렉션
        if (!token) {
            console.error("No auth token found, redirecting to home.");
            navigate('/');
            return; 
        }

        // 토큰을 포함하여 WebSocket URL 생성
        const wsStatsUrl = `ws://localhost:8000/ws_stats?token=${token}`;
        
        const ws = new WebSocket(wsStatsUrl);
        
        ws.onopen = () => console.log("WebSocket connected with token");
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.time) setStudyTime(data.time);
                if (data.status) setCurrentStatus(data.status);
                if (data.counts) {
                    setStats(prevStats => ({ // DB 스키마에 맞춰 안전하게 업데이트
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
        
        ws.onclose = (event) => {
            console.log("WebSocket disconnected:", event.reason);
            // 1008: Policy Violation (백엔드에서 보낸 'Invalid token')
            if (event.code === 1008) { 
                setCurrentStatus("Auth Error");
                navigate('/'); // 토큰 오류 시 홈으로
            } else {
                setCurrentStatus("Disconnected");
            }
        };
        
        // 컴포넌트 언마운트 시 웹소켓 연결 해제
        return () => ws.close();
    }, [navigate]); // navigate를 의존성 배열에 추가

    // --- 2. 로그인 상태(localStorage) 확인 ---
    useEffect(() => {
        const dataString = localStorage.getItem('userData');
        if (dataString) {
            setUserData(JSON.parse(dataString));
        }
    }, []); // 마운트 시 1회만 실행

    // --- 이벤트 핸들러 ---
    const handleLogout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        navigate('/');
    };

    const handleGoBack = () => {
        navigate(-1); // 이전 페이지로 이동 (예: /groups)
    };

    // --- 렌더링을 위한 데이터 준비 ---
    const userName = userData ? userData.name : '...';
    const statusClassName = `status-${currentStatus.replace(/\s+/g, '')}`;

    // '나'의 데이터 (이름과 상태가 실시간으로 변경됨)
    const myData = { 
        id: 'me', 
        name: userName, 
        status: currentStatus, // '집중' 하드코딩 대신 실시간 'currentStatus' 사용
        isMe: true 
    };
    
    // '나'를 제외한 다른 참여자 데이터 (테스트용)
    const otherParticipants = [
        { id: 1, name: '김민준', status: '자리 비움' },
        { id: 2, name: '박서연', status: '집중' },
        { id: 3, name: '이도윤', status: '딴짓' },
        { id: 4, name: '최지우', status: '집중' },
        { id: 5, name: '강하준', status: '자리 비움' },
        { id: 6, name: '윤채원', status: '집중' },
        { id: 7, name: '장민서', status: '딴짓' },
    ];

    const gridClasses = getGroupGridClasses(otherParticipants.length);


    return (
        <div className="page-layout-group">
            
            {/* 1. 왼쪽 사이드바 */}
            <aside className="sidebar">
                <Link to="/" className="logo">NODOZE</Link>

                {/* '내 상태' (웹소켓 연동됨) */}
                <div className="stats-card-time">
                    <p className="card-label">오늘의 순공시간</p>
                    <p className="card-value">{studyTime}</p>
                </div>
                <div className="stats-card-status">
                    <p className="card-label">현재 상태</p>
                    <span className={`status-badge ${statusClassName}`}>{currentStatus}</span>
                </div>
                
                {/* 로그인 정보 (localStorage 연동) */}
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

                {/* '뒤로가기' 버튼 */}
                <button onClick={handleGoBack} className="btn btn-primary">
                    뒤로가기
                </button>
            </aside>
            
            {/* 2. 메인 컨텐츠 (그룹 정보) */}
            <main className="group-main">
                <header className="group-main-header">
                    <h1>그룹 스터디: 서울대 모여라</h1>
                    
                    <div className="view-tabs">
                        <button
                            onClick={() => setMainViewTab('group')}
                            className={mainViewTab === 'group' ? 'active' : ''}
                        >
                            그룹 뷰 ({otherParticipants.length}명)
                        </button>
                        <button
                            onClick={() => setMainViewTab('my-webcam')}
                            className={mainViewTab === 'my-webcam' ? 'active' : ''}
                        >
                            내 웹캠
                        </button>
                    </div>
                </header>
                
                <div className="webcam-view">
                    {/* 탭 1: 그룹 뷰 */}
                    {mainViewTab === 'group' && (
                        <div className={`webcam-grid ${gridClasses}`}>
                            {otherParticipants.map((member) => (
                                <WebcamCard 
                                    key={member.id} 
                                    name={member.name} 
                                    status={member.status} 
                                    isMe={false} 
                                />
                            ))}
                        </div>
                    )}

                    {/* 탭 2: 내 웹캠 뷰 (영상 피드 및 실시간 상태 연동) */}
                    {mainViewTab === 'my-webcam' && (
                        <div className="my-webcam-view">
                            <WebcamCard 
                                key={myData.id} 
                                name={myData.name} 
                                status={myData.status} 
                                isMe={true} 
                                videoFeedUrl={videoFeedUrl} 
                            />
                        </div>
                    )}
                </div>

                
                {/* 컨트롤 바 */}
                <div className="controls-bar">
                    <button className="btn btn-control">🎤 마이크 끄기</button>
                    <button className="btn btn-control">📹 비디오 끄기</button>
                    <button className="btn btn-control">🖥️ 화면 공유</button>
                    {/* 나가기 버튼은 그룹 선택 페이지로 이동 */}
                    <Link to="/groups" className="btn btn-danger">🚪 나가기</Link>
                </div>
                
                {/* 하단 통계 섹션 (카드) */}
                <div className="bottom-stats-card">
                    <nav className="stats-tabs-nav">
                        <button 
                            className={activeStatsTab === 'tab-personal-stats' ? 'active' : ''}
                            onClick={() => setActiveStatsTab('tab-personal-stats')}
                        >
                            내 일일 통계
                        </button>
                         <button 
                            className={activeStatsTab === 'tab-group-ranking' ? 'active' : ''}
                            onClick={() => setActiveStatsTab('tab-group-ranking')}
                        >
                            그룹 실시간 랭킹
                        </button>
                        <button 
                            className={activeStatsTab === 'tab-group-chat' ? 'active' : ''}
                            onClick={() => setActiveStatsTab('tab-group-chat')}
                        >
                            그룹 채팅
                        </button>
                    </nav>
                    
                    <div className="stats-tabs-content">
                        {/* 탭 1: 내 일일 통계 (웹소켓 'stats' 연동) */}
                        <div className={`stats-tabs-pane personal-stats ${activeStatsTab === 'tab-personal-stats' ? 'active' : ''}`}>
                            <div className="stats-grid">
                                <div className="stats-grid-item">
                                    <p className="stat-value">{stats.away}<span>회</span></p>
                                    <p className="stat-label">자리 비움</p>
                                </div>
                                <div className="stats-grid-item">
                                    <p className="stat-value">{stats.phone}<span>회</span></p>
                                    <p className="stat-label">휴대폰/숙임</p>
                                </div>
                                <div className="stats-grid-item">
                                    <p className="stat-value">{stats.drowsy}<span>회</span></p>
                                    <p className="stat-label">졸음 감지</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* 탭 2: 그룹 실시간 랭킹 (userName 및 studyTime 연동) */}
                        <div className={`stats-tabs-pane ${activeStatsTab === 'tab-group-ranking' ? 'active' : ''}`}>
                            <ul className="group-ranking-list">
                                <li>
                                    <span className="rank-name">🥇 1. {userName}</span>
                                    <span className="rank-time">{studyTime}</span>
                                </li>
                                <li>
                                    <span className="rank-name">🥈 2. 김민준</span>
                                    <span className="rank-time">07:45:12</span>
                                </li>
                                <li>
                                    <span className="rank-name">🥉 3. 박도윤</span>
                                    <span className="rank-time">06:12:50</span>
                                </li>
                                <li>
                                    <span className="rank-name">&nbsp;&nbsp;&nbsp; 4. 이서아</span>
                                    <span className="rank-time">05:30:11</span>
                                </li>
                            </ul>
                        </div>
                        
                        {/* 탭 3: 그룹 채팅 (userName 연동) */}
                        <div className={`stats-tabs-pane group-chat ${activeStatsTab === 'tab-group-chat' ? 'active' : ''}`}>
                            <div className="chat-window">
                                <div className="chat-message-other"><strong>김민준:</strong> 다들 화이팅!</div>
                                <div className="chat-message-user"><strong>{userName} (나):</strong> 화이팅입니다!</div>
                            </div>
                            <input type="text" className="chat-input" placeholder="메시지 입력..."/>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default GroupStudyPage;