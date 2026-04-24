import api from "./api"

type Role = "candidate" | "employer"

export type NotificationPreferences = {
  in_app_enabled: boolean
  message_notifications: boolean
  application_updates: boolean
  email_message_digest: boolean
  email_application_updates: boolean
  security_alerts: boolean
}

export type ProfileData = {
  full_name?: string
  phone?: string
  degree?: string
  branch?: string
  college?: string
  cgpa?: number | null
  passout_year?: number | null
  has_gap?: boolean
  gap_duration_months?: number | null
  active_backlogs?: number | null
  total_backlogs?: number | null
  company_name?: string
  website?: string
  industry?: string
  profile_picture_url?: string | null
}

export type ProfileMeResponse = {
  id: string
  email: string
  role: Role
  is_verified: boolean
  created_at: string
  notification_preferences: NotificationPreferences
  profile?: ProfileData
}

export type UploadProfilePictureResponse = {
  message: string
  url: string
}

export type ActionMessageResponse = {
  message: string
}

export type PasswordChangeStartResponse = {
  message: string
  expires_in: number
}

export const profileService = {
  async getMe() {
    return api.get<ProfileMeResponse>("/api/profile/me")
  },

  async updateCandidateProfile(data: Record<string, any>) {
    return api.put<ActionMessageResponse>("/api/profile/candidate", data)
  },

  async updateEmployerProfile(data: Record<string, any>) {
    return api.put<ActionMessageResponse>("/api/profile/employer", data)
  },

  async uploadProfilePicture(file: File) {
    const formData = new FormData()
    formData.append("file", file)
    return api.postForm<UploadProfilePictureResponse>("/api/profile/upload-picture", formData)
  },

  async getProfilePicture(cacheKey?: string) {
    const suffix = cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : ""
    return api.getBlob(`/api/profile/picture${suffix}`)
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return api.post<PasswordChangeStartResponse>("/api/profile/change-password", {
      current_password: currentPassword,
      new_password    : newPassword,
    })
  },

  async confirmPasswordChange(currentPassword: string, newPassword: string, otp: string) {
    return api.post<ActionMessageResponse>("/api/profile/change-password/confirm", {
      current_password: currentPassword,
      new_password    : newPassword,
      otp,
    })
  },

  async getNotificationSettings() {
    return api.get<NotificationPreferences>("/api/profile/notification-settings")
  },

  async updateNotificationSettings(data: Partial<NotificationPreferences>) {
    return api.put<NotificationPreferences>("/api/profile/notification-settings", data)
  },

  async resetResume() {
    return api.delete<ActionMessageResponse>("/api/profile/resume/reset")
  },

  async deleteAccount() {
    return api.delete<ActionMessageResponse>("/api/profile/delete-account")
  },
}
