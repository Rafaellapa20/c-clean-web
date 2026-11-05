import { rpc } from './supabase'
import { getAdminSession } from './admin-auth'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  must_change_password: boolean
  password_expires_at: string | null
  created_by_name: string | null
  created_at: string
}

export async function loginAdmin(email: string, password: string) {
  const { data, error } = await rpc<Record<string, unknown>>('admin_login', {
    p_email: email,
    p_password: password,
  })
  if (error) return { error: 'server_error' }
  return data as { token?: string; name?: string; role?: string; must_change_password?: boolean; error?: string }
}

export async function validateSession(token: string) {
  const { data } = await rpc<Record<string, unknown> | null>('admin_validate_session', { p_token: token })
  return data as { id: string; name: string; role: string; must_change_password: boolean } | null
}

export async function changePassword(newPassword: string) {
  const s = getAdminSession()
  if (!s) return { error: 'unauthorized' }
  const { data } = await rpc<Record<string, unknown>>('admin_change_password', {
    p_token: s.token,
    p_new_password: newPassword,
  })
  return data as { ok?: boolean; error?: string }
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const s = getAdminSession()
  if (!s) return []
  const { data } = await rpc<AdminUser[]>('admin_get_admin_users', { p_token: s.token })
  return data || []
}

export async function createAdminUser(name: string, email: string) {
  const s = getAdminSession()
  if (!s) return { error: 'unauthorized' }
  const { data } = await rpc<Record<string, unknown>>('admin_create_admin_user', {
    p_token: s.token,
    p_name: name,
    p_email: email,
  })
  return data as { provisional_password?: string; id?: string; error?: string }
}

export async function resetAdminUser(targetId: string) {
  const s = getAdminSession()
  if (!s) return { error: 'unauthorized' }
  const { data } = await rpc<Record<string, unknown>>('admin_reset_admin_user', {
    p_token: s.token,
    p_target_id: targetId,
  })
  return data as { provisional_password?: string; error?: string }
}

export async function toggleAdminUser(targetId: string, active: boolean) {
  const s = getAdminSession()
  if (!s) return false
  const { data } = await rpc<boolean>('admin_toggle_admin_user', {
    p_token: s.token,
    p_target_id: targetId,
    p_active: active,
  })
  return !!data
}

export async function removeAdminUser(targetId: string) {
  const s = getAdminSession()
  if (!s) return false
  const { data } = await rpc<boolean>('admin_remove_admin_user', {
    p_token: s.token,
    p_target_id: targetId,
  })
  return !!data
}
