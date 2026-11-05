import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './UpdateBanner.module.css'

export default function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className={styles.banner}>
      <span>Nova versão disponível</span>
      <button className={styles.btn} onClick={() => updateServiceWorker(true)}>
        Atualizar
      </button>
    </div>
  )
}
