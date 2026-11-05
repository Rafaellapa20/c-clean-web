import { useEffect, useState } from 'react'
import { getAdminUsers, createAdminUser, resetAdminUser, toggleAdminUser, removeAdminUser, type AdminUser } from '../../lib/admin-users'
import { getAdminSession } from '../../lib/admin-auth'
import styles from './WorkersPage.module.css'

function userStatus(u: AdminUser): string {
  if (!u.active) return 'Desativado'
  if (u.must_change_password) return 'A aguardar 1.º login'
  return 'Ativo'
}

function statusClass(u: AdminUser): string {
  if (!u.active) return 'status-done'
  if (u.must_change_password) return 'status-todo'
  return 'status-doing'
}

interface ProvResult { id: string; name: string; email: string; prov: string }

export default function UsersPage() {
  const me = getAdminSession()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [fName, setFName] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [provResult, setProvResult] = useState<ProvResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setUsers(await getAdminUsers())
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    const res = await createAdminUser(fName.trim(), fEmail.trim())
    setSaving(false)
    if (res.error === 'email_taken') { setFormError('Este email já existe.'); return }
    if (res.error) { setFormError('Erro. Tenta novamente.'); return }
    setShowForm(false)
    setProvResult({ id: res.id!, name: fName.trim(), email: fEmail.trim(), prov: res.provisional_password! })
    setFName(''); setFEmail('')
    await load()
  }

  async function handleReset(u: AdminUser) {
    setBusy(u.id)
    const res = await resetAdminUser(u.id)
    setBusy(null)
    if (res.provisional_password) {
      setProvResult({ id: u.id, name: u.name, email: u.email, prov: res.provisional_password })
      await load()
    }
  }

  async function handleToggle(u: AdminUser) {
    setBusy(u.id)
    await toggleAdminUser(u.id, !u.active)
    setBusy(null)
    await load()
  }

  async function handleRemove(id: string) {
    setBusy(id)
    await removeAdminUser(id)
    setBusy(null)
    setConfirmRemove(null)
    await load()
  }

  function copyProv() {
    if (!provResult) return
    navigator.clipboard.writeText(provResult.prov).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  function waLink(r: ProvResult) {
    const url = window.location.origin + '/admin/login'
    const msg = `Olá ${r.name}! Acesso ao painel C-Clean:\n🔗 ${url}\n📧 Email: ${r.email}\n🔑 Palavra-passe provisória: ${r.prov}\n\nExpira em 7 dias. No primeiro login pedirá uma nova palavra-passe.`
    return `https://wa.me/?text=${encodeURIComponent(msg)}`
  }

  return (
    <div>
      <div className={styles.topBar}>
        <h2 className={styles.heading}>Utilizadores</h2>
        <button className="btn btn-primary" onClick={() => { setShowForm(s => !s); setFormError('') }}>
          {showForm ? 'Cancelar' : '+ Administrador'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className={`card ${styles.form}`}>
          <h3 className={styles.formTitle}>Novo administrador</h3>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Nome *</label>
              <input className="input" value={fName} onChange={e => setFName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email *</label>
              <input className="input" type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} required />
            </div>
          </div>
          {formError && <p className={styles.error}>{formError}</p>}
          <div className={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'A criar…' : 'Criar'}
            </button>
          </div>
        </form>
      )}

      {provResult && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--surface)', borderLeft: '4px solid var(--primary)' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>✓ Conta criada para {provResult.name}</p>
          <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Palavra-passe provisória (mostra-se só uma vez):
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <code style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: 2, background: 'var(--bg)', padding: '6px 12px', borderRadius: 6 }}>
              {provResult.prov}
            </code>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={copyProv}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={waLink(provResult)} target="_blank" rel="noopener" className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '6px 14px', textDecoration: 'none' }}>
              Enviar por WhatsApp
            </a>
            <button className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={() => setProvResult(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className={styles.empty}>A carregar…</p>
      ) : (
        <div className={styles.list}>
          {users.map(u => (
            <div key={u.id} className={`card ${styles.workerRow}`}>
              <div className={styles.workerInfo}>
                <span className={styles.workerName}>
                  {u.name}
                  {u.role === 'owner' && <span style={{ marginLeft: 6, fontSize: '0.72rem', background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 6px' }}>Owner</span>}
                  {u.id === me?.token && ''}
                </span>
                <span className={styles.workerPin}>{u.email}</span>
              </div>
              <div className={styles.workerStats}>
                <span className={`chip ${statusClass(u)}`}>{userStatus(u)}</span>
              </div>
              {u.role !== 'owner' && (
                <div className={styles.workerActions}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                    onClick={() => handleReset(u)}
                    disabled={busy === u.id}
                    title="Repor acesso (nova palavra-passe provisória)"
                  >
                    {busy === u.id ? '…' : 'Repor acesso'}
                  </button>
                  <button
                    className={`btn ${u.active ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                    onClick={() => handleToggle(u)}
                    disabled={busy === u.id}
                  >
                    {busy === u.id ? '…' : u.active ? 'Desativar' : 'Ativar'}
                  </button>
                  {confirmRemove === u.id ? (
                    <>
                      <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '4px 8px', background: '#e53e3e' }}
                        onClick={() => handleRemove(u.id)} disabled={busy === u.id}>
                        Confirmar
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                        onClick={() => setConfirmRemove(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                      onClick={() => setConfirmRemove(u.id)} disabled={busy === u.id}>
                      Remover
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
