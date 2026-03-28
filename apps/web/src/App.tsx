import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import GraphView from './pages/GraphView'
import CurriculumGenerator from './pages/CurriculumGenerator'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/"           element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"  element={<Dashboard />} />
                <Route path="/graph/:courseId" element={<GraphView />} />
                <Route path="/curriculum" element={<CurriculumGenerator />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App