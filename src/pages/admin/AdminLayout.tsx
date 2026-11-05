import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { logoutAdmin, getAdminSession } from '../../lib/admin-auth'
import styles from './AdminLayout.module.css'

export default function AdminLayout() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const session = getAdminSession()

  function handleLogout() {
    logoutAdmin()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <img src="/logo.png" alt="C-Clean" className={styles.logo} />
        <h1 className={styles.title}>C-Clean</h1>
        <div className={styles.actions}>
          {session && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: 4 }}>
              {session.name}
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => { const l = i18n.language === 'pt' ? 'de' : 'pt'; i18n.changeLanguage(l); localStorage.setItem('lang', l) }}>
            {i18n.language === 'pt' ? 'DE' : 'PT'}
          </button>
          <button className="btn btn-ghost" onClick={handleLogout} title="Sair">
            ⎋
          </button>
        </div>
      </header>
      <nav className={styles.nav}>
        <NavLink to="/admin/jobs" className={({ isActive }) => isActive ? styles.navActive : styles.navLink}>
          Trabalhos
        </NavLink>
        <NavLink to="/admin/workers" className={({ isActive }) => isActive ? styles.navActive : styles.navLink}>
          Funcionários
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => isActive ? styles.navActive : styles.navLink}>
          Utilizadores
        </NavLink>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
