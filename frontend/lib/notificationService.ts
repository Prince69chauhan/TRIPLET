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

export const notificationService = {
  // ── Employer ────────────────────────────────────────────────
  async getNotifications(): Promise<EmployerNotification[]> {
    return api.get<EmployerNotification[]>("/api/employers/notifications")
  },

  async markAsRead(notificationId: string): Promise<void> {
    await api.patch(`/api/employers/notifications/${notificationId}/read`)
  },

  async markAllRead(): Promise<void> {
    await api.patch("/api/employers/notifications/read-all")
  },

  // ── Candidate ───────────────────────────────────────────────
  async getCandidateNotifications(): Promise<CandidateNotification[]> {
    return api.get<CandidateNotification[]>("/api/candidates/notifications")
  },

  async markCandidateAsRead(notificationId: string): Promise<void> {
    await api.patch(`/api/candidates/notifications/${notificationId}/read`)
  },

  async markAllCandidateRead(): Promise<void> {
    await api.patch("/api/candidates/notifications/read-all")
  },
}
