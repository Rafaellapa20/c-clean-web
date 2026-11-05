const KEY = 'cclean_admin_v2'

export interface AdminSession {
  token: string
  name: string
  role: string
  mustChange: boolean
}

export function getAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AdminSession) : null
  } catch { return null }
}

export function setAdminSession(s: AdminSession): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export function logoutAdmin(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
