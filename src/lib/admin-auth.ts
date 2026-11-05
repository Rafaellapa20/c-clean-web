const KEY = 'cclean_admin'

function getPassword(): string {
  return (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || 'admin1234'
}

export function getAdminSession(): boolean {
  try { return localStorage.getItem(KEY) === 'ok' } catch { return false }
}

export function loginAdmin(password: string): boolean {
  if (password !== getPassword()) return false
  try { localStorage.setItem(KEY, 'ok') } catch { /* ignore */ }
  return true
}

export function logoutAdmin(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
