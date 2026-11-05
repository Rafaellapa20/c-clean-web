import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSession, clearSession } from '../../lib/worker-auth'
import { rpc } from '../../lib/supabase'
import JobCard from './JobCard'
import styles from './JobsPage.module.css'

export interface JobRow {
  id: string
  client: string
  address: string
  task: string
  job_date: string
  job_time: string
  status: 'todo' | 'doing' | 'done'
  started_at: string | null
  finished_at: string | null
  photo_path: string | null
  note: string | null
  created_at: string
}

export default function JobsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = getSession()
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) { navigate('/app'); return }
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    const { data } = await rpc<JobRow[]>('get_upcoming_jobs', { p_pin: session!.pin })
    setJobs(data || [])
    setLoading(false)
  }

  if (loading) return (
    <div className={styles.center}>
      <span className={styles.spinner} />
    </div>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.greeting}>{t('app.upcomingJobs')}</h2>
          <p className={styles.worker}>{session?.name}</p>
        </div>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', minHeight: 36, fontSize: '0.85rem' }}
          onClick={() => { clearSession(); navigate('/app') }}>
          Sair
        </button>
      </div>

      {jobs.length === 0
        ? <p className={styles.empty}>{t('app.noJobs')}</p>
        : jobs.map(j => <JobCard key={j.id} job={j} pin={session!.pin} onRefresh={loadJobs} />)
      }
    </div>
  )
}
