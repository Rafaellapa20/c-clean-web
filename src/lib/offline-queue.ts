import { openDB } from 'idb'
import { rpc, supabase } from './supabase'

const DB_NAME = 'cclean-offline'
const STORE = 'queue'

interface QueueItem {
  id?: number
  type: 'start_job' | 'finish_job'
  pin: string
  jobId: string
  note?: string
  photoBlob?: Blob
  photoPath?: string
  createdAt: number
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }) },
  })
}

export async function enqueue(item: Omit<QueueItem, 'id' | 'createdAt'>) {
  const db = await getDB()
  await db.add(STORE, { ...item, createdAt: Date.now() })
}

export async function syncQueue() {
  if (!navigator.onLine) return
  const db = await getDB()
  const items = await db.getAll(STORE) as QueueItem[]
  for (const item of items) {
    try {
      if (item.type === 'start_job') {
        await rpc('start_job', { p_pin: item.pin, p_job_id: item.jobId })
      } else if (item.type === 'finish_job') {
        let path = item.photoPath ?? ''
        if (item.photoBlob && !path) {
          path = `${item.jobId}.jpg`
          await supabase.storage.from('rapports').upload(path, item.photoBlob, { contentType: 'image/jpeg', upsert: true })
        }
        await rpc('finish_job', { p_pin: item.pin, p_job_id: item.jobId, p_note: item.note ?? null, p_photo_path: path })
      }
      await db.delete(STORE, item.id!)
    } catch {
      break
    }
  }
}

export function setupOfflineSync() {
  window.addEventListener('online', syncQueue)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncQueue()
  })
}
