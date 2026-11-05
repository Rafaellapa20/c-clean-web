import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changePassword } from '../../lib/admin-users'
import { getAdminSession, setAdminSession } from '../../lib/admin-auth'
import styles from './AdminLoginPage.module.css'

export default function AdminChangePasswordPage() {
  const navigate = useNavigate()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pw1.length < 12) { setError('Mínimo 12 caracteres.'); return }
    if (pw1 !== pw2) { setError('As palavras-passe não coincidem.'); return }

    setLoading(true)
    const res = await changePassword(pw1)
    setLoading(false)

    if (res.error === 'same_as_provisional') {
      setError('Não pode ser igual à palavra-passe provisória.')
      return
    }
    if (res.error) {
      setError('Erro. Tenta novamente.')
      return
    }

    const s = getAdminSession()
    if (s) setAdminSession({ ...s, mustChange: false })
    navigate('/admin/jobs', { replace: true })
  }

  return (
    <div className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <img src="/logo.png" alt="C-Clean" className={styles.logo} />
        <h1 className={styles.title}>Escolhe a tua palavra-passe</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
          Mínimo 12 caracteres.
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className="input"
            type="password"
            placeholder="Nova palavra-passe"
            value={pw1}
            onChange={e => { setPw1(e.target.value); setError('') }}
            autoFocus
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Repetir palavra-passe"
            value={pw2}
            onChange={e => { setPw2(e.target.value); setError('') }}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'A guardar…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}
