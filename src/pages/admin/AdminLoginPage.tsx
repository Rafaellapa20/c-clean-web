import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginAdmin } from '../../lib/admin-users'
import { setAdminSession } from '../../lib/admin-auth'
import styles from './AdminLoginPage.module.css'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await loginAdmin(email, password)
    setLoading(false)

    if (res.error === 'expired') {
      setError('Acesso expirado. Peça um novo acesso ao administrador.')
      return
    }
    if (res.error || !res.token) {
      setError('Email ou palavra-passe incorretos.')
      setPassword('')
      return
    }

    setAdminSession({
      token: res.token!,
      name: res.name!,
      role: res.role!,
      mustChange: !!res.must_change_password,
    })

    if (res.must_change_password) {
      navigate('/admin/change-password', { replace: true })
    } else {
      navigate('/admin/jobs', { replace: true })
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
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            autoFocus
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Palavra-passe"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
