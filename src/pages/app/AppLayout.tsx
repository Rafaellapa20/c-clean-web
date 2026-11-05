import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styles from './AppLayout.module.css'

export default function AppLayout() {
  const { i18n } = useTranslation()

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <img src="/logo.png" alt="C-Clean" className={styles.logo} />
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', minHeight: 36, padding: '6px 12px' }}
          onClick={() => { const l = i18n.language === 'pt' ? 'de' : 'pt'; i18n.changeLanguage(l); localStorage.setItem('lang', l) }}>
          {i18n.language === 'pt' ? 'DE' : 'PT'}
        </button>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
