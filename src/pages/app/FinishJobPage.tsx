import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { rpc, supabase } from '../../lib/supabase'
import { compressImage } from '../../lib/image-compress'
import { enqueue } from '../../lib/offline-queue'
import { getSession } from '../../lib/worker-auth'
import styles from './FinishJobPage.module.css'

export default function FinishJobPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const session = getSession()

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPhotoFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  async function handleSubmit() {
    if (!photoFile) { setError(t('app.photoRequired')); return }
    if (!session || !jobId) return
    setSubmitting(true)
    setError('')
    try {
      const blob = await compressImage(photoFile)
      const path = `${jobId}.jpg`

      if (navigator.onLine) {
        await supabase.storage.from('rapports').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        await rpc('finish_job', { p_pin: session.pin, p_job_id: jobId, p_note: note || null, p_photo_path: path })
      } else {
        await enqueue({ type: 'finish_job', pin: session.pin, jobId, note: note || undefined, photoBlob: blob })
      }

      navigate('/app/jobs', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>←</button>
        <h1 className={styles.title}>{t('app.finishTitle')}</h1>
      </div>

      <div className={styles.body}>
        <div className={styles.photoSection} onClick={() => inputRef.current?.click()}>
          {preview ? (
            <img src={preview} alt="foto" className={styles.preview} />
          ) : (
            <div className={styles.photoPlaceholder}>
              <span className={styles.cameraIcon}>📷</span>
              <span className={styles.photoHint}>{t('app.photoRequired')}</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.hiddenInput}
            onChange={handlePhoto}
          />
        </div>

        {preview && (
          <button className={`btn btn-secondary ${styles.retakeBtn}`} onClick={() => inputRef.current?.click()}>
            🔄 Tirar nova foto
          </button>
        )}

        <div className={styles.noteSection}>
          <label className={styles.noteLabel}>{t('app.note')}</label>
          <textarea
            className={`input ${styles.noteInput}`}
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder={t('app.note')}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={`btn btn-primary ${styles.submitBtn}`}
          onClick={handleSubmit}
          disabled={submitting || !photoFile}
        >
          {submitting ? t('common.loading') : `✓ ${t('app.completeJob')}`}
        </button>
      </div>
    </div>
  )
}
