import React from 'react';
import { Link, useNavigate } from 'react-router-dom'; // 1. useNavigate 임포트
import { supabase } from '../supabaseClient';

function HomePage() {
  // 4. Google 로그인 훅 설정
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // (선택) 로그인 후 /select 페이지로 바로 보낼 수 있습니다.
        redirectTo: 'http://localhost:5173/select'

      }
    });
    if (error) {
      console.error("Error logging in with Google:", error.message);
    }
  };
  return (
    <>
      {/* 1. 헤더 */}
      <header className="homepage-header">
        <div className="container">
          <div className="logo">
            NODOZE
          </div>
          <button onClick={handleGoogleLogin} className="btn btn-primary-sm">
            Google 계정으로 시작하기
          </button>
        </div>
      </header>

      {/* 2. Hero 섹션 */}
      <main className="homepage-main">
        <h1 className="hero-title">
          당신의 '순공시간'<br />
          AI가 <span>실시간으로</span> 지켜줍니다
        </h1>
        <p className="hero-subtitle">
          '딴짓'은 그만. NODOZE의 AI 버전 기술이 당신의 졸음, 스마트폰 사용을 감지하여 오직 '진짜 공부 시간'만 정확히 측정하고 관리합니다.
        </p>
        <Link to="/study" className="btn btn-primary">
          지금 바로 순공시간 측정하기
        </Link>
      </main>

      {/* 3. 핵심 기능 섹션 */}
      <section className="features-section">
          <div className="container">
              <h2 className="section-title">핵심 기능</h2>
              <p className="section-subtitle">
                  NODOZE가 제공하는 강력한 학습 관리 도구입니다
              </p>
              <div className="features-grid">
                  {/* 카드 1 */}
                  <div className="feature-card">
                      <div className="icon-placeholder"></div>
                      <h3 className="card-title">AI 실시간 모니터링</h3>
                      <p className="card-description">
                          웹캠을 통해 사용자의 상태를 실시간으로 분석합니다. 졸음(EAR), 스마트폰 사용(YOLO) 등을 즉각 감지합니다.
                      </p>
                  </div>
                  {/* 카드 2 */}
                  <div className="feature-card">
                      <div className="icon-placeholder"></div>
                      <h3 className="card-title">순공 시간 자동 타이머</h3>
                      <p className="card-description">
                          '딴짓'이 감지되면 순공 시간 타이머가 즉시 멈춥니다. 오직 '집중' 상태일 때만 시간을 누적합니다.
                      </p>
                  </div>
                  {/* 카드 3 */}
                  <div className="feature-card">
                      <div className="icon-placeholder"></div>
                      <h3 className="card-title">랭킹 및 그룹 스터디</h3>
                      <p className="card-description">
                          누적된 순공 시간으로 랭킹을 매기고, 친구들과 그룹을 만들어 서로의 학습을 독려하며 경쟁할 수 있습니다.
                      </p>
                  </div>
              </div>
          </div>
      </section>

      {/* 4. 최종 CTA 섹션 */}
      <section className="cta-section">
          <div className="container">
            <h2 className="section-title">더 이상의 의지력 탓은 그만.</h2>
            <p className="section-subtitle">
                NODOZE의 AI 기술로 당신의 잠재된 집중력을 끌어내 보세요.
            </p>
            <button onClick={handleGoogleLogin} className="btn btn-primary">
                Google 계정으로 시작하기
            </button>
          </div>
      </section>

      {/* 5. 푸터 */}
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