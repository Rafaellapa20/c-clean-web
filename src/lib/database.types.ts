export type JobStatus = 'todo' | 'doing' | 'done'

export interface Worker {
  id: string
  name: string
  pin: string
  push_subscription: object | null
  active: boolean
}

export interface Material {
  id: string
  name_pt: string
  name_de: string
}

export interface Job {
  id: string
  client: string
  address: string
  task: string
  date: string
  time: string
  worker_id: string
  status: JobStatus
  started_at: string | null
  finished_at: string | null
  photo_path: string | null
  note: string | null
  created_at: string
}

export interface JobMaterial {
  id: string
  job_id: string
  material_id: string | null
  custom_name: string | null
  checked: boolean
}

export type Database = {
  public: {
    Tables: {
      workers: { Row: Worker; Insert: Omit<Worker, 'id'>; Update: Partial<Worker> }
      materials: { Row: Material; Insert: Omit<Material, 'id'>; Update: Partial<Material> }
      jobs: { Row: Job; Insert: Omit<Job, 'id' | 'created_at'>; Update: Partial<Job> }
      job_materials: { Row: JobMaterial; Insert: Omit<JobMaterial, 'id'>; Update: Partial<JobMaterial> }
    }
    Functions: {
      worker_login: {
        Args: { p_pin: string }
        Returns: { id: string; name: string }
      }
      get_today_jobs: {
        Args: { p_pin: string }
        Returns: Array<{
          id: string; client: string; address: string; task: string
          job_date: string; job_time: string; status: string
          started_at: string | null; finished_at: string | null
          photo_path: string | null; note: string | null; created_at: string
        }>
      }
      get_job_materials: {
        Args: { p_pin: string; p_job_id: string }
        Returns: Array<{
          id: string; material_id: string | null; custom_name: string | null
          checked: boolean; name_pt: string | null; name_de: string | null
        }>
      }
      update_material_checked: {
        Args: { p_pin: string; p_material_row_id: string; p_checked: boolean }
        Returns: undefined
      }
      start_job: {
        Args: { p_pin: string; p_job_id: string }
        Returns: undefined
      }
      finish_job: {
        Args: { p_pin: string; p_job_id: string; p_note: string | null; p_photo_path: string }
        Returns: undefined
      }
    }
  }
}
