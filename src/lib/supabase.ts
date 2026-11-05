import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) =>
  supabase.rpc(fn as any, args as any) as unknown as Promise<{ data: T; error: unknown }>
