import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import GraphView from './pages/GraphView'
import CurriculumGenerator from './pages/CurriculumGenerator'
import AuthCallback from './pages/AuthCallback'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/"           element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"  element={<Dashboard />} />
                <Route path="/graph/:courseId" element={<GraphView />} />
                <Route path="/curriculum" element={<CurriculumGenerator />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App