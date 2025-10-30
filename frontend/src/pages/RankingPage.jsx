// src/pages/RankingPage.jsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function RankingPage() {
    const [ranking, setRanking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRanking = async () => {
            try {
                const response = await fetch("http://localhost:8000/ranking/top10");
                if (!response.ok) {
                    throw new Error("서버에서 랭킹을 불러오지 못했습니다.");
                }
                const data = await response.json();
                setRanking(data);
            } catch (err) {
                console.error("Error fetching ranking:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRanking();
    }, []);

    const renderRanking = () => {
        if (loading) {
            return <p>랭킹을 불러오는 중...</p>;
        }
        if (error) {
            return <p style={{ color: 'red' }}>{error}</p>;
        }
        if (ranking.length === 0) {
            return <p>아직 랭킹 데이터가 없습니다.</p>;
        }
        
        const rankClasses = ['rank-1', 'rank-2', 'rank-3'];

        return (
            <ol className="ranking-list">
                {ranking.map((user, index) => (
                    <li key={user.user_email} className={`ranking-item ${rankClasses[index] || ''}`}>
                        <span className={`rank-badge ${rankClasses[index] || ''}`}>
                            {index + 1}
                        </span>
                        <span className="rank-name">
                            {user.user_name || user.user_email.split('@')[0]}
                        </span>
                        <span className="rank-time">
                            {formatTime(user.daily_study_seconds)}
                        </span>
                    </li>
                ))}
            </ol>
        );
    };

    return (
        <div className="page-layout-full">
            <header className="page-header">
                <div className="container">
                    <Link to="/" className="logo-lg">NO<span className='blue-doze'>DOZE</span></Link>
                    <Link to="/select" className="btn btn-primary-sm">뒤로가기</Link>
                </div>
            </header>
            <main className="select-study-main container">
                <h1 className="welcome-title">🏆 Top 10 랭킹</h1>
                
                <div className="ranking-card">
                    {renderRanking()}
                </div>
            </main>
        </div>
    );
}

export default RankingPage;