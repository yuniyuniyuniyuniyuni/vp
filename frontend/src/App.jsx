// src/App.jsx

import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import SoloStudyPage from './pages/SoloStudyPage.jsx'
// 1. 새로 만든 페이지 임포트
import SelectStudyPage from './pages/SelectStudyPage.jsx'
import GroupSelectPage from './pages/GroupSelectPage.jsx'
import GroupStudyPage from './pages/GroupStudyPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<SoloStudyPage />} />
      
      {/* 2. 새로운 경로 추가 */}
      <Route path="/select" element={<SelectStudyPage />} />
      <Route path="/groups" element={<GroupSelectPage />} />

      {/* (선택) 그룹 카드에서 연결한 예시 경로들 (임시) */}
      <Route path="/groups/new" element={<div>새 그룹 만들기 페이지</div>} />
      <Route path="/group/:id" element={<GroupStudyPage />} />
    </Routes>
  )
}

export default App