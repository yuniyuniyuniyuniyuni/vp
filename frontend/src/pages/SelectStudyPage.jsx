// src/pages/SelectStudyPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function SelectStudyPage() {
    // [수정] userName 대신 userData 객체 전체를 상태로 관리
    const [userData, setUserData] = useState(null); 
    const navigate = useNavigate();

    // [수정] localStorage에서 객체를 가져와 userData 상태에 저장
    useEffect(() => {
        const userDataString = localStorage.getItem('userData');
        if (userDataString) {
            setUserData(JSON.parse(userDataString));
        } else {
            // 사용자 정보가 없으면 홈페이지로 리디렉션
            navigate('/');
        }
    }, [navigate]);

    // 로그아웃 핸들러 (기존과 동일)
    const handleLogout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        navigate('/');
    };

    return (
        <div className="page-layout-full">
            {/* 1. 상단 헤더 */}
            <header className="page-header">
                <div className="container">
                    <Link to="/" className="logo-lg">
                        NODOZE
                    </Link>
                    
                    {/* --- [수정된 부분] --- */}
                    {/* 기존 user-info div를 요청하신 코드로 교체 */}
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
                    {/* --- [수정 완료] --- */}
                    
                </div>
            </header>

            {/* 2. 메인 콘텐츠 (모드 선택) */}
            <main className="select-study-main">
                {/* 8. 하드코딩된 이름 대신 상태 변수 사용 */}
                <h1 className="welcome-title">안녕하세요 {userData ? userData.name : '...'}님!</h1>
                <p className="welcome-subtitle">오늘은 어떤 모드로 스터디를 시작하시겠어요?</p>

                <div className="selection-card-area">
                    
                    {/* 카드 1: 개인 스터디 (selected 클래스 추가) */}
                    <div className="selection-card selected">
                        <div className="card-icon-placeholder">
                            {/* 아이콘 플레이스홀더 */}
                        </div>
                        <h2 className="card-title">개인 스터디</h2>
                        <p className="card-description">
                            AI가 당신의 학습을 1:1로 관리해줍니다.<br />
                            오직 순공시간에만 집중해보세요!
                        </p>
                        <Link to="/study" className="btn btn-primary">
                            시작하기
                        </Link>
                    </div>

                    {/* 카드 2: 그룹 스터디 */}
                    <div className="selection-card">
                        <div className="card-icon-placeholder">
                            {/* 아이콘 플레이스홀더 */}
                        </div>
                        <h2 className="card-title">그룹 스터디</h2>
                        <p className="card-description">
                            친구들과 함께 공부하고<br />
                            랭킹 확인해서 선물 받아가세요!
                        </p>
                        <Link to="/groups" className="btn btn-primary">
                            시작하기
                        </Link>
                    </div>

                </div>
            </main>
        </div>
    );
}

export default SelectStudyPage;