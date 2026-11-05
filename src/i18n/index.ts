import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from './pt'
import de from './de'

i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, de: { translation: de } },
  lng: localStorage.getItem('lang') || 'pt',
  fallbackLng: 'pt',
  interpolation: { escapeValue: false },
})

export default i18n
