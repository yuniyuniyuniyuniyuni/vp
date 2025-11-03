// src/App.jsx

import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import SoloStudyPage from './pages/SoloStudyPage.jsx'
import RankingPage from './pages/RankingPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<SoloStudyPage />} />
      <Route path="/ranking" element={<RankingPage />} />
    </Routes>
  )
}

export default App