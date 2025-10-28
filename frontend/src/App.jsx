// src/App.jsx

import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import SoloStudyPage from './pages/SoloStudyPage.jsx'
import SelectStudyPage from './pages/SelectStudyPage.jsx'
import GroupSelectPage from './pages/GroupSelectPage.jsx'
import GroupStudyPage from './pages/GroupStudyPage.jsx'
import RankingPage from './pages/RankingPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<SoloStudyPage />} />
      <Route path="/ranking" element={<RankingPage />} />
      <Route path="/select" element={<SelectStudyPage />} />
      <Route path="/groups" element={<GroupSelectPage />} />
      <Route path="/groups/new" element={<div>새 그룹 만들기 페이지</div>} />
      <Route path="/group/:id" element={<GroupStudyPage />} />
    </Routes>
  )
}

export default App