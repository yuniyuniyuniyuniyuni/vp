import React, { useState, useEffect } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function HomePage() {
  const [userData, setUserData] = useState(null); 
  const navigate = useNavigate();
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserData({
          name: user.user_metadata.name || user.email.split('@')[0],
          picture: user.user_metadata.picture,
        });
      }
    };
    fetchUserData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const user = session.user;
          setUserData({
            name: user.user_metadata.name || user.email.split('@')[0],
            picture: user.user_metadata.picture,
          });
        } else if (event === 'SIGNED_OUT') {
          setUserData(null);
        }
      }
    );
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      console.error("Error logging in with Google:", error.message);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error logging out:", error.message);
    }
  };

    const handleStartStudy = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      navigate('/study');
    } catch (err) {
      console.error('Error checking auth status:', err);
      await handleGoogleLogin();
    }
  };

  return (
    <>
      <header className="homepage-header">
        <div className="container">
          <div className="logo-lg">
            NO<span className="blue-doze">DOZE</span>
          </div>
          {userData ? (
            <div className="header-user-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {userData.picture && (
                <img 
                  src={userData.picture} 
                  alt="프로필" 
                  style={{ width: '36px', height: '36px', borderRadius: '50%' }} 
                />
              )}
              <span style={{ color: '#000', fontSize: '16px', fontWeight: '500' }}>
                {userData.name}님
              </span>
              <button 
                onClick={handleLogout} 
                className="btn btn-primary-sm"
                style={{ background: '#4A5568', borderColor: '#4A5568' }} 
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button onClick={handleGoogleLogin} className="btn btn-primary-sm">
              Google 계정으로 시작하기
            </button>
          )}
        </div>
      </header>

      <main className="homepage-main">
        <h1 className="hero-title">
          당신의 '순공시간'<br />
          AI가 <span>실시간으로</span> 지켜줍니다
        </h1>
        <p className="hero-subtitle">
          '딴짓'은 그만. NODOZE의 AI 버전 기술이 당신의 졸음, 스마트폰 사용을 감지하여 <br /> 오직 '진짜 공부 시간'만 정확히 측정하고 관리합니다.
        </p>
        <button onClick={handleStartStudy} className="btn btn-primary">
          지금 바로 순공시간 측정하기
        </button>
      </main>

      <section className="features-section">
          <div className="container">
              <h2 className="section-title">핵심 기능</h2>
              <p className="section-subtitle">
                  NODOZE가 제공하는 강력한 학습 관리 도구입니다
              </p>
              <div className="features-grid">
                  <div className="feature-card">
                      <img src="/monitor.png" alt="AI 실시간 모니터링 아이콘" className="icon-placeholder" />
                      <h3 className="card-title">AI 실시간 모니터링</h3>
                      <p className="card-description">
                          웹캠을 통해 사용자의 상태를 실시간으로 분석합니다. 졸음(EAR), 스마트폰 사용(YOLO) 등을 즉각 감지합니다.
                      </p>
                  </div>
                  <div className="feature-card">
                      <img src="/timer.png" alt="AI 실시간 모니터링 아이콘" className="icon-placeholder" />
                      <h3 className="card-title">순공 시간 자동 타이머</h3>
                      <p className="card-description">
                          '딴짓'이 감지되면 순공 시간 타이머가 즉시 멈춥니다. 오직 '집중' 상태일 때만 시간을 누적합니다.
                      </p>
                  </div>
                  <div className="feature-card">
                      <img src="/group.png" alt="AI 실시간 모니터링 아이콘" className="icon-placeholder" />
                      <h3 className="card-title">랭킹 및 그룹 스터디</h3>
                      <p className="card-description">
                          누적된 순공 시간으로 랭킹을 매기고, 친구들과 그룹을 만들어 서로의 학습을 독려하며 경쟁할 수 있습니다.
                      </p>
                  </div>
              </div>
          </div>
      </section>
      
      <section className="cta-section">
          <div className="container">
            <h2 className="section-title">더 이상의 의지력 탓은 그만.</h2>
            <p className="section-subtitle">
                NODOZE의 AI 기술로 당신의 잠재된 집중력을 끌어내 보세요.
            </p>
            
            {userData ? (
              <button onClick={handleStartStudy} className="btn btn-primary">
                  지금 바로 순공시간 측정하기
              </button>
            ) : (
              <button onClick={handleGoogleLogin} className="btn btn-primary">
                  Google 계정으로 시작하기
              </button>
            )}
          </div>
      </section>

      <footer className="homepage-footer">
          <div className="container">
              <div className="footer-logo">
                  NODOZE
              </div>
              <p>
                  © 2025 (Intel) CV Project. All rights reserved.
              </p>
              <p>
                  AI가 여러분의 꿈을 응원합니다.
              </p>
          </div>
      </footer>
    </>
  );
}

export default HomePage;