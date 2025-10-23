// frontend/src/pages/SoloStudyPage.jsx

import React, { useState, useEffect } from 'react'; // 1. useState, useEffect 임포트
import { Link } from 'react-router-dom';

function SoloStudyPage() {
  // 백엔드 URL
  const videoFeedUrl = "http://localhost:8000/video_feed";
  const wsStatsUrl = "ws://localhost:8000/ws_stats"; // 2. WebSocket URL

  // 3. 시간과 상태를 저장할 React State 변수 선언
  const [studyTime, setStudyTime] = useState("00:00:00");
  const [currentStatus, setCurrentStatus] = useState("Initializing");

  const [stats, setStats] = useState({
    drowsy: 0,
    phone: 0,
    away: 0
  });

  // 4. WebSocket 연결 및 메시지 처리
  useEffect(() => {
    // WebSocket 객체 생성
    const ws = new WebSocket(wsStatsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    // 백엔드로부터 메시지를 수신했을 때
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 시간 업데이트
        if (data.time) {
          setStudyTime(data.time);
        }
        // 상태 업데이트
        if (data.status) {
          setCurrentStatus(data.status);
        }
        // [새로 추가] 카운트 업데이트
        if (data.counts) {
          setStats(data.counts);
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
      setCurrentStatus("Disconnected");
    };

    // [중요] 컴포넌트가 언마운트(페이지 이탈 등)될 때 WebSocket 연결을 닫습니다.
    return () => {
      ws.close();
    };
  }, []); // [] 빈 배열: 이 useEffect는 컴포넌트가 처음 렌더링될 때 1회만 실행됩니다.

  // 5. 상태(status)에 따라 동적으로 Tailwind CSS 클래스를 반환하는 객체
  const statusStyles = {
    "Studying": "bg-green-100 text-green-800",
    "Drowsy": "bg-yellow-100 text-yellow-800",
    "Using Phone": "bg-red-100 text-red-800",
    "Away": "bg-gray-100 text-gray-800",
    "Initializing": "bg-blue-100 text-blue-800",
    "Disconnected": "bg-gray-300 text-gray-900",
    "Error": "bg-red-200 text-red-900",
  };
  
  // 현재 상태에 맞는 스타일을 가져오거나, 없으면 기본값(Initializing) 사용
  const statusStyle = statusStyles[currentStatus] || statusStyles["Initializing"];

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 1. 상단 헤더 (수정 없음) */}
      <header className="bg-white border-b border-gray-200 h-16 flex-shrink-0 flex items-center px-6 space-x-6">
        <Link to="/" className="text-2xl font-bold text-black">
          NODOZE
        </Link>
        <h1 className="text-xl font-semibold text-gray-700">
          AI 실시간 모니터링
        </h1>
      </header>

      {/* 2. 메인 바디 (사이드바 + 콘텐츠) */}
      <div className="flex flex-1 overflow-hidden">

        {/* 사이드바 */}
        <aside className="w-64 bg-white p-6 flex flex-col shadow-lg z-10">

          {/* --- [수정됨] --- */}
          {/* '오늘의 순공시간'을 React State 변수(studyTime)와 연결 */}
          <div className="bg-blue-600 text-white p-5 rounded-lg shadow-md">
            <p className="text-sm font-semibold text-blue-100" style={{ textAlign: 'center' }}>오늘의 순공시간</p>
            <p className="text-3xl font-bold tracking-tight mt-1" style={{ textAlign: 'center' }}>
              {studyTime}
            </p>
          </div>
          {/* --- [수정 완료] --- */}


          {/* --- [수정됨] --- */}
          {/* '현재 상태'를 React State 변수(currentStatus) 및 동적 스타일과 연결 */}
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 mb-2">현재 상태</p>
            <span 
              className={`text-sm font-bold px-3 py-1 rounded-full ${statusStyle}`}
              style={{ borderRadius: '10px' }}
            >
              {currentStatus}
            </span>
          </div>
          {/* --- [수정 완료] --- */}


          {/* 네비게이션 (수정 없음) */}
          <nav className="mt-8 space-y-2">
            {/* ... (생략) ... */}
            <a href="#" className="flex items-center space-x-3 text-gray-800 font-semibold bg-gray-100 p-2 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.868 2.884c.321-.772 1.415-.772 1.736 0l1.681 4.06c.064.155.18.288.324.368l4.464 1.096c.808.198 1.135 1.106.546 1.677l-3.23 3.148a.99.99 0 00-.286.732l.762 4.444c.137.803-.71.1.424-1.123L11.08 15.21a.994.994 0 00-.916 0l-3.996 2.098c-.69.362-1.56-.32-1.424-1.123l.762-4.444a.99.99 0 00-.286-.732L1.18 10.19c-.59-.57-.262-1.479.546-1.677l4.464-1.096a.99.99 0 00.324-.368L8.264 2.884z" clipRule="evenodd" />
              </svg>
              <span>대시보드</span>
            </a>
          </nav>

          {/* 나가기 버튼 (수정 없음) */}
          <Link to="/" className="mt-auto btn-primary font-semibold py-3 px-5 rounded-md text-center transition duration-300">
            나가기
          </Link>
        </aside>

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 p-8 overflow-y-auto no-scrollbar">

          {/* 웹캠 영상 (수정 없음) */}
          <div className="bg-gray-800 rounded-lg shadow-xl aspect-video flex items-center justify-center overflow-hidden">
            <img 
              src={videoFeedUrl} 
              alt="AI Monitor Feed" 
              className="w-full h-full object-cover" 
            />
          </div>

          {/* 일일 통계 (수정 없음 - 이 부분도 WebSocket으로 실시간 업데이트 가능하지만 일단 보류) */}
          <div className="bg-white p-8 rounded-lg shadow-xl mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">일일 통계</h2>
            
            {/* 집중 효율 (이건 아직 정적 데이터입니다) */}
            <div>
              {/* ... (프로그레스 바 생략) ... */}
            </div>

            {/* '딴짓' 통계 (State 변수와 연결) */}
            <div className="grid grid-cols-3 gap-6 text-center mt-8 pt-6 border-t border-gray-200">
              <div>
                <p className="text-4xl font-extrabold text-gray-800">
                  {stats.away} {/* '1' -> stats.away */}
                  <span className="text-lg font-semibold ml-1">회</span>
                </p>
                <p className="text-sm font-medium text-gray-500 mt-1">자리 비움</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-gray-800">
                  {stats.phone} {/* '3' -> stats.phone */}
                  <span className="text-lg font-semibold ml-1">회</span>
                </p>
                <p className="text-sm font-medium text-gray-500 mt-1">휴대폰 감지</p>
              </div>
              <div>
                <p className="text-4xl font-extrabold text-gray-800">
                  {stats.drowsy} {/* '5' -> stats.drowsy */}
                  <span className="text-lg font-semibold ml-1">회</span>
                </p>
                <p className="text-sm font-medium text-gray-500 mt-1">졸음 감지</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SoloStudyPage;