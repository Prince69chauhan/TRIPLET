import api from "./api"
import { clearRequestCache } from "./request-cache"

type AuthTokens = {
  access_token: string
  refresh_token: string
  token_type: string
  role: string
}

type LoginStartResponse = {
  message: string
  email: string
  expires_in: number
}

type MeResponse = {
  id: string
  email: string
  role: string
  is_active: boolean
  is_verified: boolean
  created_at: string
}

function persistSession(data: AuthTokens) {
  if (typeof window === "undefined") return
  clearRequestCache()
  localStorage.setItem("access_token", data.access_token)
  localStorage.setItem("refresh_token", data.refresh_token)
  localStorage.setItem("user_role", data.role)
}

export const authService = {
  async registerCandidate(data: {
    email: string
    password: string
    full_name: string
  }) {
    if (typeof window !== "undefined") {
      clearRequestCache()
      localStorage.removeItem("profile_complete")
    }
    return api.post("/api/auth/register/candidate", data)
  },

  async registerEmployer(data: {
    email: string
    password: string
    company_name: string
    website?: string
    industry?: string
  }) {
    if (typeof window !== "undefined") {
      clearRequestCache()
      localStorage.removeItem("profile_complete")
    }
    return api.post("/api/auth/register/employer", data)
  },

  async login(data: { email: string; password: string }) {
    return api.post<LoginStartResponse>("/api/auth/login", data)
  },

  async verifyOtp(email: string, otp: string) {
    const response = await api.post<AuthTokens>("/api/auth/verify-otp", { email, otp })
    persistSession(response)
    return response
  },

  async resendOtp(email: string) {
    return api.post<{ message: string; expires_in: number }>("/api/auth/resend-otp", { email })
  },

  async forgotPassword(email: string) {
    return api.post<{ message: string }>("/api/auth/forgot-password", { email })
  },

  async resetPassword(token: string, new_password: string) {
    return api.post<{ message: string }>("/api/auth/reset-password", { token, new_password })
  },

  async getMe(): Promise<MeResponse> {
    return api.get<MeResponse>("/api/auth/me")
  },

  async logout() {
    try {
      await api.post("/api/auth/logout")
    } finally {
      clearRequestCache()
      if (typeof window !== "undefined") {
        localStorage.clear()
      }
    }
  },

  isLoggedIn(): boolean {
    if (typeof window === "undefined") return false
    return !!localStorage.getItem("access_token")
  },

  getRole(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem("user_role")
  },

  isProfileComplete(): boolean {
    if (typeof window === "undefined") return false
    return localStorage.getItem("profile_complete") === "true"
  },

  markProfileComplete() {
    if (typeof window !== "undefined") {
      localStorage.setItem("profile_complete", "true")
    }
  },
}
