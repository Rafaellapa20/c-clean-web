import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { rpc } from '../../lib/supabase'
import { enqueue, syncQueue } from '../../lib/offline-queue'
import type { JobRow } from './JobsPage'
import styles from './JobCard.module.css'

interface MaterialRow {
  id: string
  material_id: string | null
  custom_name: string | null
  checked: boolean
  name_pt: string | null
  name_de: string | null
}

interface Props {
  job: JobRow
  pin: string
  onRefresh: () => void
}

function mapsUrl(address: string): string {
  const encoded = encodeURIComponent(address)
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  return isIOS ? `maps://?daddr=${encoded}` : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
}

function elapsed(startedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  return h > 0 ? `${h}h ${m.toString().padStart(2,'0')}m` : `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
}

export default function JobCard({ job, pin, onRefresh }: Props) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [open, setOpen] = useState(job.status === 'doing')
  const [timer, setTimer] = useState('')
  const [starting, setStarting] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (open && materials.length === 0) loadMaterials()
  }, [open])

  useEffect(() => {
    if (job.status === 'doing' && job.started_at) {
      setTimer(elapsed(job.started_at))
      intervalRef.current = setInterval(() => setTimer(elapsed(job.started_at!)), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [job.status, job.started_at])

  async function loadMaterials() {
    const { data } = await rpc<MaterialRow[]>('get_job_materials', { p_pin: pin, p_job_id: job.id })
    setMaterials(data || [])
  }

  async function toggleMaterial(id: string, checked: boolean) {
    setMaterials(m => m.map(x => x.id === id ? { ...x, checked } : x))
    await rpc('update_material_checked', { p_pin: pin, p_material_row_id: id, p_checked: checked })
  }

  async function handleStart() {
    setStarting(true)
    try {
      if (navigator.onLine) {
        await rpc('start_job', { p_pin: pin, p_job_id: job.id })
        await syncQueue()
      } else {
        await enqueue({ type: 'start_job', pin, jobId: job.id })
      }
      onRefresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('already_active')) alert(t('app.onlyOneActive'))
    } finally {
      setStarting(false)
    }
  }

  const allChecked = materials.length > 0 && materials.every(m => m.checked)
  const statusLabel = { todo: t('status.todo'), doing: t('status.doing'), done: t('status.done') }[job.status]
  const statusClass = { todo: 'status-todo', doing: 'status-doing', done: 'status-done' }[job.status]
  const timeStr = job.job_time?.slice(0, 5) ?? ''

  function materialName(m: MaterialRow) {
    if (m.custom_name) return m.custom_name
    return i18n.language === 'de' ? (m.name_de ?? '') : (m.name_pt ?? '')
  }

  return (
    <div className={`card ${styles.card} ${job.status === 'doing' ? styles.doing : ''}`}>
      <div className={styles.top} onClick={() => setOpen(o => !o)}>
        <div className={styles.info}>
          <span className={styles.time}>{timeStr}</span>
          <h3 className={styles.client}>{job.client}</h3>
          <p className={styles.address}>{job.address}</p>
          <p className={styles.task}>{job.task}</p>
        </div>
        <div className={styles.right}>
          <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
          {job.status === 'doing' && timer && <span className={styles.timer}>{timer}</span>}
          <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className={styles.body}>
          <a href={mapsUrl(job.address)} className={`btn btn-secondary ${styles.mapsBtn}`} target="_blank" rel="noreferrer">
            📍 {t('app.openMaps')}
          </a>

          {materials.length > 0 && (
            <div className={styles.materials}>
              <h4 className={styles.matTitle}>{t('app.materialList')}</h4>
              {materials.map(m => (
                <label key={m.id} className={styles.matRow}>
                  <input type="checkbox" checked={m.checked} onChange={e => toggleMaterial(m.id, e.target.checked)} className={styles.check} />
                  <span className={m.checked ? styles.matNameDone : styles.matName}>{materialName(m)}</span>
                </label>
              ))}
              {allChecked && <p className={styles.allDone}>{t('app.allChecked')}</p>}
            </div>
          )}

          {job.status === 'todo' && (
            <button className={`btn btn-primary ${styles.actionBtn}`} onClick={handleStart} disabled={starting}>
              {starting ? '…' : t('app.startJob')}
            </button>
          )}

          {job.status === 'doing' && (
            <button
              className={`btn btn-primary ${styles.actionBtn}`}
              onClick={() => navigate(`/app/finish/${job.id}`)}
            >
              📷 {t('app.finishJob')}
            </button>
          )}

          {job.status === 'done' && job.finished_at && (
            <p className={styles.doneNote}>
              ✓ {new Date(job.finished_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {job.note && ` — ${job.note}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
