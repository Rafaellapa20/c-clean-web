import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { rpc, supabase } from '../../lib/supabase'
import styles from './JobsPage.module.css'

interface AdminJob {
  id: string
  client: string
  address: string
  task: string
  job_date: string
  job_time: string
  status: string
  worker_name: string | null
  started_at: string | null
  finished_at: string | null
  photo_path: string | null
  note: string | null
}

interface Worker { id: string; name: string; active: boolean }
interface Material { id: string; name_pt: string; name_de: string }

function duration(start: string, end: string): string {
  const mins = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export default function JobsPage() {
  const { t, i18n } = useTranslation()
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoJobId, setPhotoJobId] = useState<string | null>(null)

  // form state
  const [fClient, setFClient] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fTask, setFTask] = useState('')
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10))
  const [fTime, setFTime] = useState('09:00')
  const [fWorker, setFWorker] = useState('')
  const [fMats, setFMats] = useState<string[]>([])
  const [fCustom, setFCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [j, w, m] = await Promise.all([
      rpc<AdminJob[]>('admin_get_today_jobs'),
      rpc<Worker[]>('admin_get_workers'),
      rpc<Material[]>('admin_get_materials'),
    ])
    setJobs(j.data || [])
    setWorkers((w.data || []).filter(x => x.active))
    setMaterials(m.data || [])
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!fClient || !fAddress || !fTask || !fWorker) { setFormError('Preenche todos os campos obrigatórios'); return }
    setSaving(true); setFormError('')
    try {
      const customNames = fCustom.split(',').map(s => s.trim()).filter(Boolean)
      await rpc('admin_create_job', {
        p_client: fClient, p_address: fAddress, p_task: fTask,
        p_date: fDate, p_time: fTime, p_worker_id: fWorker,
        p_material_ids: fMats.length ? fMats : null,
        p_custom_names: customNames.length ? customNames : null,
      })
      setShowForm(false)
      setFClient(''); setFAddress(''); setFTask(''); setFMats([]); setFCustom('')
      await load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  async function openPhoto(jobId: string, path: string) {
    if (photoJobId === jobId) { setPhotoJobId(null); setPhotoUrl(null); return }
    const { data } = await supabase.storage.from('rapports').createSignedUrl(path, 300)
    setPhotoUrl(data?.signedUrl || null)
    setPhotoJobId(jobId)
  }

  function matName(m: Material) {
    return i18n.language === 'de' ? m.name_de : m.name_pt
  }

  const statusLabel = (s: string) => ({ todo: t('status.todo'), doing: t('status.doing'), done: t('status.done') }[s] ?? s)
  const statusClass = (s: string) => ({ todo: 'status-todo', doing: 'status-doing', done: 'status-done' }[s] ?? '')

  return (
    <div>
      <div className={styles.topBar}>
        <h2 className={styles.heading}>{t('admin.todayJobs')}</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? t('common.cancel') : `+ ${t('admin.newJob')}`}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className={`card ${styles.form}`}>
          <h3 className={styles.formTitle}>{t('admin.newJob')}</h3>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>{t('admin.client')} *</label>
              <input className="input" value={fClient} onChange={e => setFClient(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('admin.worker')} *</label>
              <select className="input" value={fWorker} onChange={e => setFWorker(e.target.value)} required>
                <option value="">—</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('admin.address')} *</label>
            <input className="input" value={fAddress} onChange={e => setFAddress(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('admin.task')} *</label>
            <textarea className="input" rows={2} value={fTask} onChange={e => setFTask(e.target.value)} required />
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>{t('admin.date')}</label>
              <input className="input" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('admin.time')}</label>
              <input className="input" type="time" value={fTime} onChange={e => setFTime(e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t('admin.materials')}</label>
            <div className={styles.matGrid}>
              {materials.map(m => (
                <label key={m.id} className={styles.matCheck}>
                  <input type="checkbox" checked={fMats.includes(m.id)}
                    onChange={e => setFMats(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                  {matName(m)}
                </label>
              ))}
            </div>
            <input className={`input ${styles.customInput}`} placeholder={t('admin.otherMaterial')}
              value={fCustom} onChange={e => setFCustom(e.target.value)} />
          </div>
          {formError && <p className={styles.error}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('admin.sendJob')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className={styles.empty}>{t('common.loading')}</p>
      ) : jobs.length === 0 ? (
        <p className={styles.empty}>{t('app.noJobs')}</p>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.tableRow} ${styles.tableHead}`}>
            <span>{t('admin.time')}</span>
            <span>{t('admin.client')}</span>
            <span>{t('admin.worker')}</span>
            <span>Status</span>
            <span>{t('admin.start')}</span>
            <span>{t('admin.end')}</span>
            <span>{t('admin.total')}</span>
            <span>{t('admin.photo')}</span>
          </div>
          {jobs.map(j => (
            <div key={j.id} className={`${styles.tableRow} card`}>
              <span className={styles.time}>{j.job_time?.slice(0, 5)}</span>
              <div>
                <div className={styles.client}>{j.client}</div>
                <div className={styles.address}>{j.address}</div>
                <div className={styles.task}>{j.task}</div>
              </div>
              <span>{j.worker_name ?? '—'}</span>
              <span className={statusClass(j.status)}>{statusLabel(j.status)}</span>
              <span>{j.started_at ? new Date(j.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              <span>{j.finished_at ? new Date(j.finished_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              <span>{j.started_at && j.finished_at ? duration(j.started_at, j.finished_at) : '—'}</span>
              <span>
                {j.photo_path ? (
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                    onClick={() => openPhoto(j.id, j.photo_path!)}>
                    {photoJobId === j.id ? '✕' : '📷'}
                  </button>
                ) : <span className={styles.noPhoto}>{t('admin.noPhoto')}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {photoUrl && (
        <div className={styles.photoModal} onClick={() => { setPhotoUrl(null); setPhotoJobId(null) }}>
          <img src={photoUrl} alt="rapport" className={styles.photoImg} />
        </div>
      )}
    </div>
  )
}
