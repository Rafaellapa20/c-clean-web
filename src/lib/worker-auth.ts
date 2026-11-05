import { rpc } from './supabase'

export interface WorkerSession {
  id: string
  name: string
  pin: string
}

const KEY = 'cclean_worker'

export function getSession(): WorkerSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveSession(s: WorkerSession) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSession() {
  localStorage.removeItem(KEY)
}

export async function loginWithPin(pin: string): Promise<WorkerSession> {
  const { data, error } = await rpc<{ id: string; name: string }>('worker_login', { p_pin: pin })
  if (error) throw new Error('invalid_pin')
  const worker = data!
  const session: WorkerSession = { id: worker.id, name: worker.name, pin }
  saveSession(session)
  return session
}
