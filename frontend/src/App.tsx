import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import AgentDetail from './pages/AgentDetail'
import AgentCreate from './pages/AgentCreate'
import SkillStore from './pages/SkillStore'
import Channels from './pages/Channels'
import AIModels from './pages/AIModels'
import Sessions from './pages/Sessions'
import AuditLog from './pages/AuditLog'
import Admin from './pages/Admin'
import { isLoggedIn } from './lib/api'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/create" element={<AgentCreate />} />
        <Route path="agents/:id" element={<AgentDetail />} />
        <Route path="skills" element={<SkillStore />} />
        <Route path="channels" element={<Channels />} />
        <Route path="models" element={<AIModels />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="admin" element={<Admin />} />
      </Route>
    </Routes>
  )
}
