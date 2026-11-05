import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loginWithPin } from '../../lib/worker-auth'
import { subscribePush } from '../../lib/push'
import styles from './LoginPage.module.css'

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleKey(k: string) {
    if (loading) return
    setError(false)
    if (k === 'del') {
      setPin(p => p.slice(0, -1))
      return
    }
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setLoading(true)
      try {
        await loginWithPin(next)
        subscribePush(next) // fire-and-forget, no await
        navigate('/app/jobs')
      } catch {
        setError(true)
        setPin('')
      } finally {
        setLoading(false)
      }
    }
  }

  const dots = Array.from({ length: 4 }, (_, i) => i < pin.length)

  return (
    <div className={styles.wrap}>
      <img src="/logo.png" alt="C-Clean" className={styles.logo} />
      <h1 className={styles.title}>C-Clean</h1>

      <div className={styles.dots}>
        {dots.map((filled, i) => (
          <span key={i} className={filled ? styles.dotFilled : styles.dot} />
        ))}
      </div>

      {error && <p className={styles.error}>{t('app.loginError')}</p>}

      <div className={styles.keypad}>
        {['1','2','3','4','5','6','7','8','9','','0','del'].map(k => (
          k === '' ? <span key="empty" /> :
          <button
            key={k}
            className={k === 'del' ? styles.keyDel : styles.key}
            onClick={() => handleKey(k)}
            disabled={loading}
            aria-label={k === 'del' ? 'Apagar' : k}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>

      <span className={styles.version}>{t('common.version', { version: APP_VERSION })}</span>
    </div>
  )
}
