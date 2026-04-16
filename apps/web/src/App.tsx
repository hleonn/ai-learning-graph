import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import GraphView from './pages/GraphView'
import CurriculumGenerator from './pages/CurriculumGenerator'
import AuthCallback from './pages/AuthCallback'
import BootcampCreator from './pages/BootcampCreator'
import BootcampGraphView from './pages/BootcampGraphView'
import ProgramView from './pages/ProgramView'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/"           element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"  element={<Dashboard />} />
                <Route path="/graph/:courseId" element={<GraphView />} />
                <Route path="/curriculum" element={<CurriculumGenerator />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/bootcamp" element={<BootcampCreator />} />
                <Route path="/bootcamp-graph" element={<BootcampGraphView />} />
                <Route path="/program/:id" element={<ProgramView />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App