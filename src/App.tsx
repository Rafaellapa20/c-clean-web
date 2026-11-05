import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './pages/admin/AdminLayout'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import JobsPage from './pages/admin/JobsPage'
import WorkersPage from './pages/admin/WorkersPage'
import AppLayout from './pages/app/AppLayout'
import LoginPage from './pages/app/LoginPage'
import WorkerJobsPage from './pages/app/JobsPage'
import FinishJobPage from './pages/app/FinishJobPage'
import { getSession } from './lib/worker-auth'
import { getAdminSession } from './lib/admin-auth'
import UpdateBanner from './components/UpdateBanner'

function RequireWorker({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/app" replace />
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  return getAdminSession() ? <>{children}</> : <Navigate to="/admin/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <Routes>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="jobs" replace />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="workers" element={<WorkersPage />} />
        </Route>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<LoginPage />} />
          <Route path="jobs" element={<RequireWorker><WorkerJobsPage /></RequireWorker>} />
          <Route path="finish/:jobId" element={<RequireWorker><FinishJobPage /></RequireWorker>} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
