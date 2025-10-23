// src/App.jsx

// 1. '.jsx' 확장자를 꼭 추가해 주세요.
import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import SoloStudyPage from './pages/SoloStudyPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<SoloStudyPage />} />
    </Routes>
  )
}

export default App