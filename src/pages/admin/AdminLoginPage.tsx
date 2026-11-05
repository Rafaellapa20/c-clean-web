import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginAdmin } from '../../lib/admin-auth'
import styles from './AdminLoginPage.module.css'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loginAdmin(password)) {
      navigate('/admin/jobs', { replace: true })
    } else {
      setError(true)
      setPassword('')
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={`card ${styles.card}`}>
        <img src="/logo.png" alt="C-Clean" className={styles.logo} />
        <h1 className={styles.title}>C-Clean Admin</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className="input"
            type="password"
            placeholder="Palavra-passe"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false) }}
            autoFocus
          />
          {error && <p className={styles.error}>Palavra-passe incorreta</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
