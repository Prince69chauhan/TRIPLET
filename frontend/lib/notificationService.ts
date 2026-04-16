import api from "./api"

export interface EmployerNotification {
  id             : string
  type           : string
  subject        : string
  body           : string
  status         : string
  created_at     : string
  is_read        : boolean
  candidate_name : string | null
  job_title      : string | null
  resume_file    : string | null
}

export interface CandidateNotification {
  id         : string
  type       : string
  subject    : string
  body       : string
  status     : string
  created_at : string
  is_read    : boolean
}

async function __timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now()
  try {
    const result = await fn()
    console.log(`[latency] ${label}: ${(performance.now() - t0).toFixed(1)}ms`)
    return result
  } catch (err) {
    console.log(`[latency] ${label} (error): ${(performance.now() - t0).toFixed(1)}ms`)
    throw err
  }
}

export const notificationService = {
  // ── Employer ────────────────────────────────────────────────
  async getNotifications(): Promise<EmployerNotification[]> {
    return __timed("notif.employer.list", () =>
      api.get<EmployerNotification[]>("/api/employers/notifications"),
    )
  },

  async markAsRead(notificationId: string): Promise<void> {
    await __timed("notif.employer.markRead", () =>
      api.patch(`/api/employers/notifications/${notificationId}/read`),
    )
  },

  async markAllRead(): Promise<void> {
    await __timed("notif.employer.markAllRead", () =>
      api.patch("/api/employers/notifications/read-all"),
    )
  },

  // ── Candidate ───────────────────────────────────────────────
  async getCandidateNotifications(): Promise<CandidateNotification[]> {
    return __timed("notif.candidate.list", () =>
      api.get<CandidateNotification[]>("/api/candidates/notifications"),
    )
  },

  async markCandidateAsRead(notificationId: string): Promise<void> {
    await __timed("notif.candidate.markRead", () =>
      api.patch(`/api/candidates/notifications/${notificationId}/read`),
    )
  },

  async markAllCandidateRead(): Promise<void> {
    await __timed("notif.candidate.markAllRead", () =>
      api.patch("/api/candidates/notifications/read-all"),
    )
  },
}
