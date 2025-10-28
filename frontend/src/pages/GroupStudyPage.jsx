// src/pages/GroupStudyPage.jsx

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const getGroupGridClasses = (count) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-3";
    if (count === 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 8) return "grid-cols-3";
    if (count === 9) return "grid-cols-3";
    if (count === 10) return "grid-cols-3"; 
    return "grid-cols-3";
};

const WebcamCard = ({ name, status, isMe = false, videoFeedUrl }) => {
    let statusColorClass = 'status-green'; 
    if (status === '자리 비움') statusColorClass = 'status-yellow';
    if (status === 'Using Phone' || status === 'Drowsy' || status === 'Lying Down' || status === '딴짓' || status === '졸음') {
        statusColorClass = 'status-red';
    }
    const cardClass = isMe ? "webcam-card is-me" : "webcam-card";

    return (
        <div className={cardClass}>
            <div className="webcam-placeholder">
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
    const videoFeedUrl = "http://localhost:8000/video_feed";

    const [studyTime, setStudyTime] = useState("00:00:00");
    const [currentStatus, setCurrentStatus] = useState("Initializing");
    const [stats, setStats] = useState({ drowsy: 0, phone: 0, away: 0, lying_down: 0 });
    const [activeStatsTab, setActiveStatsTab] = useState('tab-personal-stats');
    const [mainViewTab, setMainViewTab] = useState('group');
    
    const [userData, setUserData] = useState(null); 
    const navigate = useNavigate(); 
    const ws = useRef(null);
    useEffect(() => {
        
        const connectWebSocket = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (session) {
                const token = session.access_token;
                const wsStatsUrl = `ws://localhost:8000/ws_stats?token=${token}`;
                console.log("Connecting WebSocket with Supabase token...");

                ws.current = new WebSocket(wsStatsUrl);
                
                ws.current.onopen = () => console.log("WebSocket connected");
                
                ws.current.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.time) setStudyTime(data.time);
                        if (data.status) setCurrentStatus(data.status);
                        if (data.counts) {
                            setStats(prevStats => ({ ...prevStats, ...data.counts }));
                        }
                    } catch (e) { console.error("Failed to parse WebSocket message", e); }
                };
                
                ws.current.onerror = (error) => { console.error("WebSocket error:", error); };
                
                ws.current.onclose = (event) => {
                    console.log("WebSocket disconnected:", event.reason);
                    if (event.code === 1008) { navigate('/'); }
                    else { setCurrentStatus("Disconnected"); }
                };
            } else {
                console.log("No session found. Redirecting to home.");
                navigate('/');
            }
        };

        connectWebSocket();
        return () => {
            if (ws.current) {
                console.log("Closing WebSocket...");
                ws.current.close();
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
            } else {
                 navigate('/'); 
            }
        };
        fetchUserData();
    }, [navigate]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUserData(null); 
        navigate('/'); 
    };

    const handleGoBack = () => {
        navigate(-1); 
    };
    const userName = userData ? userData.name : '...';
    const statusClassName = `status-${currentStatus.replace(/\s+/g, '')}`;
    const myData = { 
        id: 'me', 
        name: userName, 
        status: currentStatus, 
        isMe: true 
    };
    const otherParticipants = [
        { id: 1, name: '김민준', status: '자리 비움' },
        { id: 2, name: '박서연', status: '집중' },
        { id: 3, name: '이도윤', status: '딴짓' },
        { id: 4, name: '최지우', status: '집중' },
    ];
    const gridClasses = getGroupGridClasses(otherParticipants.length);


    return (
        <div className="page-layout-group">
            <aside className="sidebar">
                <Link to="/" className="logo">NODOZE</Link>

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

                <div className="controls-bar">
                    <button className="btn btn-control">🎤 마이크 끄기</button>
                    <button className="btn btn-control">📹 비디오 끄기</button>
                    <button className="btn btn-control">🖥️ 화면 공유</button>
                    <Link to="/groups" className="btn btn-danger">🚪 나가기</Link>
                </div>

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