// src/pages/GroupSelectPage.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function GroupSelectPage() {
    // [수정] userName 대신 userData 객체 전체를 상태로 관리
    const [userData, setUserData] = useState(null);
    const navigate = useNavigate();

    // [수정] localStorage에서 객체를 가져와 userData 상태에 저장
    useEffect(() => {
        const userDataString = localStorage.getItem('userData');
        if (userDataString) {
            setUserData(JSON.parse(userDataString));
        } else {
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
        <div className="page-layout-gray">

            {/* 1. 상단 헤더 */}
            <header className="page-header-sticky">
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

            {/* 2. 메인 콘텐츠 (그룹 스터디 로비) */}
            <main className="group-select-main container">
                
                <div className="group-select-header">
                    <div className="title-area">
                        <h1>그룹 스터디</h1>
                        <p>참여하고 싶은 그룹을 찾거나 그룹을 생성해보세요</p>
                    </div>
                    <Link to="/groups/new" className="btn btn-primary btn-create-group">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                        </svg>
                        <span>새 그룹 만들기</span>
                    </Link>
                </div>

                {/* 검색창 */}
                <div className="search-bar-container">
                    <input 
                        type="text" 
                        placeholder="그룹 이름 또는 태그로 검색" 
                        className="search-bar"
                    />
                </div>

                {/* 그룹 목록 그리드 */}
                <div className="group-grid">
                    
                    {/* 그룹 카드 (예시 1) */}
                    <div className="group-card">
                        <div className="group-card-header">
                            <h3 className="group-card-title">서울대 모여라!</h3>
                            <span className="group-card-privacy">공개</span>
                        </div>
                        <p className="group-card-description">그냥 같이 공부해주라</p>
                        <div className="group-card-tags">
                            <span className="group-card-tag">#의치한</span>
                            <span className="group-card-tag">#서울대</span>
                            <span className="group-card-tag">#의대생</span>
                        </div>
                        <div className="group-card-footer">
                            <span className="group-card-members">5 / 10명</span>
                            <Link to="/group/1" className="btn btn-primary-sm">
                                참여하기
                            </Link>
                        </div>
                    </div>

                    {/* 그룹 카드 (예시 2) */}
                    <div className="group-card">
                        <div className="group-card-header">
                            <h3 className="group-card-title">서울대 모여라!</h3>
                            <span className="group-card-privacy">공개</span>
                        </div>
                        <p className="group-card-description">그냥 같이 공부해주라</p>
                        <div className="group-card-tags">
                            <span className="group-card-tag">#의치한</span>
                            <span className="group-card-tag">#서울대</span>
                            <span className="group-card-tag">#의대생</span>
                        </div>
                        <div className="group-card-footer">
                            <span className="group-card-members">5 / 10명</span>
                            <Link to="/group/2" className="btn btn-primary-sm">
                                참여하기
                            </Link>
                        </div>
                    </div>

                    {/* 그룹 카드 (예시 3) */}
                    <div className="group-card">
                        <div className="group-card-header">
                            <h3 className="group-card-title">서울대 모여라!</h3>
                            <span className="group-card-privacy">공개</span>
                        </div>
                        <p className="group-card-description">그냥 같이 공부해주라</p>
                        <div className="group-card-tags">
                            <span className="group-card-tag">#의치한</span>
                            <span className="group-card-tag">#서울대</span>
                            <span className="group-card-tag">#의대생</span>
                        </div>
                        <div className="group-card-footer">
                            <span className="group-card-members">5 / 10명</span>
                            <Link to="/group/3" className="btn btn-primary-sm">
                                참여하기
                            </Link>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}

export default GroupSelectPage;