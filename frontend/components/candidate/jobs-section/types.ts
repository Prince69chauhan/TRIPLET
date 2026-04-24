"use client"

export type JobLifecycleStatus = "active" | "paused" | "removed" | "completed"

export interface Job {
  id: string
  title: string
  description: string
  department?: string | null
  employment_type?: string | null
  location?: string | null
  salary?: string | null
  vacancies?: number | null
  required_skills: string[]
  min_tenth_percentage?: number | null
  min_twelfth_percentage?: number | null
  min_cgpa: number | null
  allow_gap: boolean
  max_gap_months?: number | null
  allow_backlogs: boolean
  max_active_backlogs?: number | null
  bonus_skill_in_project?: number | null
  bonus_elite_internship?: number | null
  bonus_project_level?: number | null
  bonus_internship_duration?: number | null
  is_active: boolean
  created_at: string
  min_passout_year?: number
  max_passout_year?: number
  saved_at?: string
  status?: JobLifecycleStatus
}

export interface AppliedJob extends Omit<Job, "status" | "saved_at"> {
  application_id: string
  status: string
  applied_at: string
  final_score_d: number | null
  passed_hard_filter: boolean | null
  filter_fail_reason: string | null
  job_status?: string
}

export type Tab = "available" | "applied" | "saved"

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export interface TabListState<T> {
  items: T[]
  total: number
  page: number
  hasMore: boolean
  loaded: boolean
  queryKey: string
}
