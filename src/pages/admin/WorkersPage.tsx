import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { rpc, supabase } from '../../lib/supabase'
import styles from './WorkersPage.module.css'

interface AdminWorker {
  id: string
  name: string
  pin: string
  active: boolean
  jobs_today: number
}

export default function WorkersPage() {
  const { t } = useTranslation()
  const [workers, setWorkers] = useState<AdminWorker[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [fName, setFName] = useState('')
  const [fPin, setFPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [notifyingId, setNotifyingId] = useState<string | null>(null)
  const [notifyMsg, setNotifyMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await rpc<AdminWorker[]>('admin_get_workers')
    setWorkers(data || [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{4}$/.test(fPin)) { setError('PIN deve ter 4 dígitos'); return }
    setSaving(true); setError('')
    try {
      await rpc('admin_add_worker', { p_name: fName, p_pin: fPin })
      setShowForm(false); setFName(''); setFPin('')
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setError(msg.includes('pin_taken') ? 'PIN já existe' : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(w: AdminWorker) {
    setTogglingId(w.id)
    try {
      await rpc('admin_toggle_worker', { p_worker_id: w.id, p_active: !w.active })
      await load()
    } catch {
      /* ignore */
    } finally {
      setTogglingId(null)
    }
  }

  async function handleNotify(w: AdminWorker) {
    setNotifyingId(w.id)
    try {
      const { error } = await supabase.functions.invoke('send-push', {
        body: { p_worker_id: w.id, p_title: 'C-Clean', p_body: t('admin.notifyBody') },
      })
      if (error) throw error
      setNotifyMsg(`${w.name} ✓`)
      setTimeout(() => setNotifyMsg(''), 3000)
    } catch {
      setNotifyMsg('Erro ao notificar')
      setTimeout(() => setNotifyMsg(''), 3000)
    } finally {
      setNotifyingId(null)
    }
  }

  return (
    <div>
      <div className={styles.topBar}>
        <h2 className={styles.heading}>{t('admin.workers')}</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? t('common.cancel') : `+ ${t('admin.addWorker')}`}
        </button>
      </div>

      {notifyMsg && <p className={styles.notifyMsg}>{notifyMsg}</p>}

      {showForm && (
        <form onSubmit={handleAdd} className={`card ${styles.form}`}>
          <h3 className={styles.formTitle}>{t('admin.addWorker')}</h3>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>{t('admin.workerName')} *</label>
              <input className="input" value={fName} onChange={e => setFName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('admin.workerPin')} *</label>
              <input className="input" type="text" inputMode="numeric" maxLength={4}
                pattern="\d{4}" value={fPin} onChange={e => setFPin(e.target.value)} required />
            </div>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className={styles.empty}>{t('common.loading')}</p>
      ) : (
        <div className={styles.list}>
          {workers.map(w => (
            <div key={w.id} className={`card ${styles.workerRow}`}>
              <div className={styles.workerInfo}>
                <span className={styles.workerName}>{w.name}</span>
                <span className={styles.workerPin}>PIN: {w.pin}</span>
              </div>
              <div className={styles.workerStats}>
                <span className={`chip ${w.active ? 'status-doing' : 'status-done'}`}>
                  {w.active ? 'Ativo' : 'Inativo'}
                </span>
                <span className={styles.jobsToday}>
                  {w.jobs_today} {t('admin.jobsToday')}
                </span>
              </div>
              <div className={styles.workerActions}>
                <button
                  className={`btn ${w.active ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => handleToggle(w)}
                  disabled={togglingId === w.id}
                >
                  {togglingId === w.id ? '…' : w.active ? t('admin.deactivate') : t('admin.activate')}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => handleNotify(w)}
                  disabled={notifyingId === w.id}
                  title={t('admin.notify')}
                >
                  {notifyingId === w.id ? '…' : '🔔'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
