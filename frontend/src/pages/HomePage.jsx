import React from 'react';
import { Link } from 'react-router-dom'; // 1. Link 임포트

function HomePage() {
  return (
    <> {/* HTML의 <body> 태그 대신 Fragment 사용 */}
      {/* 1. 헤더 */}
      <header className="py-4">
        <div className="container mx-auto max-w-6xl px-6 flex justify-between items-center">
          {/* 로고 */}
          <div className="text-2xl font-bold text-black">
            NODOZE
          </div>
          {/* 로그인 버튼 (요청대로 /study 로 이동) */}
          <Link to="/study" className="btn-primary font-semibold py-2 px-5 rounded-md text-sm transition duration-300">
            Google 계정으로 시작하기
          </Link>
        </div>
      </header>

      {/* 2. Hero 섹션 */}
      <main className="container mx-auto max-w-6xl px-6 text-center pt-24 pb-32">
        <h1 className="text-5xl md:text-6xl font-extrabold text-black leading-tight mb-6">
          당신의 '순공시간'<br />
          AI가 <span className="text-blue-600">실시간으로</span> 지켜줍니다
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          '딴짓'은 그만. NODOZE의 AI 버전 기술이 당신의 졸음, 스마트폰 사용을 감지하여 오직 '진짜 공부 시간'만 정확히 측정하고 관리합니다.
        </p>
        {/* "지금 바로 순공시간 측정하기" 버튼 (요청대로 /study 로 이동) */}
        <Link to="/study" className="btn-primary font-bold py-3 px-8 rounded-md text-lg transition duration-300 shadow-lg shadow-blue-500/30">
          지금 바로 순공시간 측정하기
        </Link>
      </main>

      {/* ... (3. 핵심 기능 섹션, 4. CTA 섹션, 5. 푸터) ... */}
      {/* (HTML의 나머지 부분을 복사-붙여넣기 하고 class -> className 으로 변경) */}

      {/* 3. 핵심 기능 섹션 */}
      <section className="bg-gray-50 py-24">
          <div className="container mx-auto max-w-6xl px-6 text-center">
              <h2 className="text-4xl font-bold text-black mb-4">핵심 기능</h2>
              <p className="text-lg text-gray-500 mb-16">
                  NODOZE가 제공하는 강력한 학습 관리 도구입니다
              </p>
              <div className="grid md:grid-cols-3 gap-8">
                  {/* 카드 1 */}
                  <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 text-left">
                      <div className="w-16 h-16 bg-blue-100 rounded-full mb-6"></div>
                      <h3 className="text-2xl font-bold text-black mb-3">AI 실시간 모니터링</h3>
                      <p className="text-gray-600">
                          웹캠을 통해 사용자의 상태를 실시간으로 분석합니다. 졸음(EAR), 스마트폰 사용(YOLO) 등을 즉각 감지합니다.
                      </p>
                  </div>
                  {/* 카드 2 */}
                  <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 text-left">
                      <div className="w-16 h-16 bg-blue-100 rounded-full mb-6"></div>
                      <h3 className="text-2xl font-bold text-black mb-3">순공 시간 자동 타이머</h3>
                      <p className="text-gray-600">
                          '딴짓'이 감지되면 순공 시간 타이머가 즉시 멈춥니다. 오직 '집중' 상태일 때만 시간을 누적합니다.
                      </p>
                  </div>
                  {/* 카드 3 */}
                  <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 text-left">
                      <div className="w-16 h-16 bg-blue-100 rounded-full mb-6"></div>
                      <h3 className="text-2xl font-bold text-black mb-3">랭킹 및 그룹 스터디</h3>
                      <p className="text-gray-600">
                          누적된 순공 시간으로 랭킹을 매기고, 친구들과 그룹을 만들어 서로의 학습을 독려하며 경쟁할 수 있습니다.
                      </p>
                  </div>
              </div>
          </div>
      </section>

      {/* 4. 최종 CTA 섹션 */}
      <section className="bg-white py-24">
          <div className="container mx-auto max-w-6xl px-6 text-center">
              <h2 className="text-4xl font-bold text-black mb-4">더 이상의 의지력 탓은 그만.</h2>
              <p className="text-lg text-gray-500 mb-10">
                  NODOZE의 AI 기술로 당신의 잠재된 집중력을 끌어내 보세요.
              </p>
              <Link to="/study" className="btn-primary font-bold py-3 px-8 rounded-md text-lg transition duration-300 shadow-lg shadow-blue-500/30">
                  Google 계정으로 시작하기
              </Link>
          </div>
      </section>

      {/* 5. 푸터 */}
      <footer className="bg-gray-100 border-t border-gray-200 py-10">
          <div className="container mx-auto max-w-6xl px-6 text-center text-gray-500">
              <div className="text-xl font-bold text-gray-700 mb-2">
                  NODOZE
              </div>
              <p className="text-sm">
                  © 2025 (Intel) CV Project. All rights reserved.
              </p>
              <p className="text-sm mt-1">
                  AI가 여러분의 꿈을 응원합니다.
              </p>
          </div>
      </footer>
    </>
  );
}

export default HomePage;