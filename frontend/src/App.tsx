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
import Admin from './pages/Admin'
import AdminSkills from './pages/AdminSkills'
import Chat from './pages/Chat'
import CronJobs from './pages/CronJobs'
import FileManager from './pages/FileManager'
import KnowledgeBase from './pages/KnowledgeBase'
import SystemSettings from './pages/SystemSettings'
import ApiAccess from './pages/ApiAccess'
import Nodes from './pages/Nodes'
import { isLoggedIn, getMe } from './lib/api'
import { useState, useEffect } from 'react'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'admin' | 'denied'>('loading')
  useEffect(() => {
    getMe()
      .then(u => setState(u.role === 'admin' ? 'admin' : 'denied'))
      .catch(() => setState('denied'))
  }, [])
  if (state === 'loading') return null
  if (state === 'denied') return <Navigate to="/dashboard" replace />
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
        <Route path="chat" element={<Chat />} />
        <Route path="skills" element={<SkillStore />} />
        <Route path="channels" element={<Channels />} />
        <Route path="models" element={<AIModels />} />
        <Route path="files" element={<FileManager />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="cron" element={<CronJobs />} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="admin-skills" element={<RequireAdmin><AdminSkills /></RequireAdmin>} />
        <Route path="nodes" element={<RequireAdmin><Nodes /></RequireAdmin>} />
        <Route path="api" element={<ApiAccess />} />
        <Route path="settings" element={<RequireAdmin><SystemSettings /></RequireAdmin>} />
      </Route>
    </Routes>
  )
}
