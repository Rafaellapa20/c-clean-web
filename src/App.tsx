import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './pages/admin/AdminLayout'
import JobsPage from './pages/admin/JobsPage'
import WorkersPage from './pages/admin/WorkersPage'
import AppLayout from './pages/app/AppLayout'
import LoginPage from './pages/app/LoginPage'
import WorkerJobsPage from './pages/app/JobsPage'
import FinishJobPage from './pages/app/FinishJobPage'
import { getSession } from './lib/worker-auth'
import UpdateBanner from './components/UpdateBanner'

function RequireWorker({ children }: { children: React.ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/app" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <UpdateBanner />
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
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
