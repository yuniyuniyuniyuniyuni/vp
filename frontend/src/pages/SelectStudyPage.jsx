// src/pages/SelectStudyPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // [추가] Supabase 클라이언트 임포트

function SelectStudyPage() {
    // [수정] userName 대신 userData 객체 전체를 저장
    const [userData, setUserData] = useState(null); 
    const navigate = useNavigate();

    // [수정] 컴포넌트 로드 시 localStorage 대신 Supabase 세션 확인
    useEffect(() => {
        const fetchUserData = async () => {
            // 1. Supabase에 현재 로그인한 사용자 정보 요청
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // 2. 사용자가 있으면 상태에 저장 (UI 표시용)
                setUserData({
                    name: user.user_metadata.name || user.email,
                    picture: user.user_metadata.picture
                });
            } else {
                // 3. 사용자가 없으면(로그인 안 됐으면) 홈페이지로 리디렉션
                console.log("No user found, redirecting to home.");
                navigate('/');
            }
        };

        fetchUserData();
    }, [navigate]); // navigate가 변경될 때만 실행

    // [수정] 로그아웃 핸들러
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut(); // Supabase 로그아웃 호출
        if (error) {
            console.error("Error logging out:", error.message);
        }
        // 로그아웃 시 자동으로 onAuthStateChange가 트리거되어
        // 다른 페이지(예: SoloStudyPage)에서도 로그아웃이 감지됩니다.
        navigate('/'); // 홈으로 이동
    };

    return (
        <div className="page-layout-full">
            {/* 1. 상단 헤더 */}
            <header className="page-header">
                <div className="container">
                    <Link to="/" className="logo-lg">
                        NODOZE
                    </Link>
                    
                    {/* [수정] 사용자 정보 UI (userData가 null이 아닐 때만 표시) */}
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
                </div>
            </header>

            {/* 2. 메인 콘텐츠 (모드 선택) */}
            <main className="select-study-main">
                {/* [수정] 환영 메시지 (userData가 로드된 후 표시) */}
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