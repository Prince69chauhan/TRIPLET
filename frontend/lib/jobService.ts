import api from "./api"
import { getCachedRequest, invalidateRequestCache } from "./request-cache"

type QueryOptions = {
  force?: boolean
}

type PaginatedQuery = QueryOptions & {
  search?: string
  location?: string
  department?: string
  employment_type?: string
  salary?: string
  status?: string
  passed?: string
  filter_mode?: string
  sort_by?: string
  sort_order?: "asc" | "desc"
  page?: number
  page_size?: number
}

const JOB_QUERY_KEYS = {
  list: "jobs:list",
  discover: (query: string) => `jobs:discover:${query}`,
  job: (jdId: string) => `jobs:item:${jdId}`,
  manage: (query: string) => `jobs:manage:${query}`,
  myJobs: "jobs:mine",
  byStatus: (status: string) => `jobs:status:${status}`,
  counts: "jobs:counts",
  recent: "jobs:recent",
  leaderboard: (jdId: string, query = "") => `jobs:leaderboard:${jdId}:${query}`,
  analytics: "jobs:analytics",
  dailyApplications: "jobs:daily-applications",
  saved: "jobs:saved",
  savedPaginated: (query: string) => `jobs:saved:${query}`,
  applied: "jobs:applied",
  appliedPaginated: (query: string) => `jobs:applied:${query}`,
} as const

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (key === "force") continue
    if (value === undefined || value === "" || value === "all") continue
    searchParams.set(key, String(value))
  }

  return searchParams.toString()
}

function invalidateJobReads(...keys: string[]) {
  invalidateRequestCache(keys.length ? keys : [
    "jobs:list",
    "jobs:discover:",
    "jobs:item:",
    "jobs:manage:",
    "jobs:mine",
    "jobs:status:",
    "jobs:counts",
    "jobs:recent",
    "jobs:leaderboard:",
    "jobs:analytics",
    "jobs:daily-applications",
    "jobs:saved",
    "jobs:applied",
  ])
}

export const jobService = {
  async discoverJobs(query: PaginatedQuery = {}) {
    const qs = buildQueryString(query)
    const key = JOB_QUERY_KEYS.discover(qs)
    if (query.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/jobs/discover${qs ? `?${qs}` : ""}`), 10_000)
  },

  async listJobs(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.list)
    return getCachedRequest(JOB_QUERY_KEYS.list, () => api.get("/api/jobs"), 15_000)
  },

  async getJob(jdId: string, options: QueryOptions = {}) {
    const key = JOB_QUERY_KEYS.job(jdId)
    if (options.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/jobs/${jdId}`), 15_000)
  },

  async createJob(data: Record<string, any>) {
    const response = await api.post("/api/jobs", data)
    invalidateJobReads(
      JOB_QUERY_KEYS.list,
      "jobs:discover:",
      JOB_QUERY_KEYS.myJobs,
      "jobs:manage:",
      "jobs:status:",
      JOB_QUERY_KEYS.counts,
      JOB_QUERY_KEYS.recent,
      JOB_QUERY_KEYS.analytics,
      JOB_QUERY_KEYS.dailyApplications,
    )
    return response
  },

  async updateJob(jdId: string, data: Record<string, any>) {
    const response = await api.put(`/api/jobs/${jdId}`, data)
    invalidateJobReads(
      JOB_QUERY_KEYS.list,
      "jobs:discover:",
      JOB_QUERY_KEYS.job(jdId),
      "jobs:manage:",
      JOB_QUERY_KEYS.myJobs,
      "jobs:status:",
      JOB_QUERY_KEYS.counts,
      JOB_QUERY_KEYS.recent,
      JOB_QUERY_KEYS.analytics,
      JOB_QUERY_KEYS.dailyApplications,
      "jobs:leaderboard:",
      JOB_QUERY_KEYS.saved,
      JOB_QUERY_KEYS.applied,
    )
    return response
  },

  async getMyJobs(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.myJobs)
    return getCachedRequest(JOB_QUERY_KEYS.myJobs, () => api.get("/api/employers/jobs"), 15_000)
  },

  async getJobsByStatus(status: "posted" | "active" | "inactive" | "past" | "all", options: QueryOptions = {}) {
    const key = JOB_QUERY_KEYS.byStatus(status)
    if (options.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/jobs/by-status?status=${status}`), 15_000)
  },

  async getManagedJobs(query: PaginatedQuery = {}) {
    const qs = buildQueryString(query)
    const key = JOB_QUERY_KEYS.manage(qs)
    if (query.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/jobs/manage${qs ? `?${qs}` : ""}`), 10_000)
  },

  async getJobCounts(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.counts)
    return getCachedRequest(JOB_QUERY_KEYS.counts, () => api.get("/api/jobs/counts"), 10_000)
  },

  async getRecentJobs(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.recent)
    return getCachedRequest(JOB_QUERY_KEYS.recent, () => api.get("/api/jobs/recent"), 10_000)
  },

  async updateJobStatus(
    jdId: string,
    status: "active" | "paused" | "removed" | "completed",
  ) {
    const response = await api.patch(`/api/jobs/${jdId}/status`, { status })
    invalidateJobReads(
      JOB_QUERY_KEYS.list,
      "jobs:discover:",
      JOB_QUERY_KEYS.job(jdId),
      "jobs:manage:",
      JOB_QUERY_KEYS.myJobs,
      "jobs:status:",
      JOB_QUERY_KEYS.counts,
      JOB_QUERY_KEYS.recent,
      JOB_QUERY_KEYS.analytics,
      JOB_QUERY_KEYS.dailyApplications,
      "jobs:leaderboard:",
      JOB_QUERY_KEYS.saved,
      JOB_QUERY_KEYS.applied,
    )
    return response
  },

  async getRankedCandidates(jdId: string, query: PaginatedQuery = {}) {
    const qs = buildQueryString(query)
    const key = JOB_QUERY_KEYS.leaderboard(jdId, qs)
    if (query.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/scores/leaderboard/${jdId}${qs ? `?${qs}` : ""}`), 10_000)
  },

  async shortlistCandidates(
    jdId: string,
    payload: {
      application_ids?     : string[]
      top_n?               : number
      reject_others?       : boolean
      custom_shortlist_msg?: string
      custom_rejection_msg?: string
    },
  ) {
    const res = await api.post(`/api/applications/shortlist/${jdId}`, payload)
    invalidateJobReads(
      JOB_QUERY_KEYS.leaderboard(jdId),
      JOB_QUERY_KEYS.analytics,
      JOB_QUERY_KEYS.dailyApplications,
      JOB_QUERY_KEYS.applied,
    )
    return res
  },

  async apply(jdId: string) {
    const response = await api.post("/api/applications", { jd_id: jdId })
    invalidateJobReads(
      JOB_QUERY_KEYS.applied,
      JOB_QUERY_KEYS.saved,
      "jobs:discover:",
      JOB_QUERY_KEYS.job(jdId),
      JOB_QUERY_KEYS.leaderboard(jdId),
      JOB_QUERY_KEYS.analytics,
      JOB_QUERY_KEYS.dailyApplications,
    )
    return response
  },

  async getSavedJobs(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.saved)
    return getCachedRequest(JOB_QUERY_KEYS.saved, () => api.get("/api/candidates/saved-jobs"), 10_000)
  },

  async getSavedJobsPage(query: PaginatedQuery = {}) {
    const qs = buildQueryString(query)
    const key = JOB_QUERY_KEYS.savedPaginated(qs)
    if (query.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/candidates/saved-jobs/paginated${qs ? `?${qs}` : ""}`), 10_000)
  },

  async saveJob(jdId: string) {
    const response = await api.post(`/api/candidates/saved-jobs/${jdId}`)
    invalidateJobReads(JOB_QUERY_KEYS.saved, JOB_QUERY_KEYS.job(jdId))
    return response
  },

  async unsaveJob(jdId: string) {
    await api.delete(`/api/candidates/saved-jobs/${jdId}`)
    invalidateJobReads(JOB_QUERY_KEYS.saved, JOB_QUERY_KEYS.job(jdId))
  },

  async getAppliedJobs(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.applied)
    return getCachedRequest(JOB_QUERY_KEYS.applied, () => api.get("/api/candidates/applied-jobs"), 10_000)
  },

  async getAppliedJobsPage(query: PaginatedQuery = {}) {
    const qs = buildQueryString(query)
    const key = JOB_QUERY_KEYS.appliedPaginated(qs)
    if (query.force) invalidateRequestCache(key)
    return getCachedRequest(key, () => api.get(`/api/candidates/applied-jobs/paginated${qs ? `?${qs}` : ""}`), 10_000)
  },

  async getJobAnalytics(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.analytics)
    return getCachedRequest(JOB_QUERY_KEYS.analytics, () => api.get("/api/jobs/analytics"), 10_000)
  },

  async getDailyApplications(options: QueryOptions = {}) {
    if (options.force) invalidateRequestCache(JOB_QUERY_KEYS.dailyApplications)
    return getCachedRequest(JOB_QUERY_KEYS.dailyApplications, () => api.get("/api/jobs/daily-applications"), 10_000)
  },

  invalidateJobReads,
}
