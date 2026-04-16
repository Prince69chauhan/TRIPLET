/**
 * Triplet - Axios API client
 * Auto-injects JWT and refreshes the access token on 401 responses.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios"
import { clearRequestCache } from "@/lib/request-cache"
import { clearAuthSession, getSessionValue, setSessionValue } from "@/lib/browser-session"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
})

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = getSessionValue("access_token")
    if (token) {
      config.headers = config.headers ?? new AxiosHeaders()
      config.headers.set("Authorization", `Bearer ${token}`)
    }
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      typeof window !== "undefined"
    ) {
      originalRequest._retry = true

      try {
        const refreshToken = getSessionValue("refresh_token")
        if (!refreshToken) throw new Error("No refresh token")

        const refreshResponse = await axios.post<{ access_token: string }>(
          `${BASE_URL}/api/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { "Content-Type": "application/json" } }
        )

        const newToken = refreshResponse.data.access_token
        setSessionValue("access_token", newToken)

        originalRequest.headers = originalRequest.headers ?? new AxiosHeaders()
        originalRequest.headers.set("Authorization", `Bearer ${newToken}`)

        return apiClient(originalRequest)
      } catch (refreshError) {
        clearRequestCache()
        clearAuthSession()
        window.location.href = "/"
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

const api = {
  async get<T>(path: string, headers?: Record<string, string>) {
    const response = await apiClient.get<T>(path, { headers })
    return response.data
  },

  async post<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    const response = await apiClient.post<T>(path, body, { headers })
    return response.data
  },

  async put<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    const response = await apiClient.put<T>(path, body, { headers })
    return response.data
  },

  async patch<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    const response = await apiClient.patch<T>(path, body, { headers })
    return response.data
  },

  async delete<T>(path: string, headers?: Record<string, string>) {
    const response = await apiClient.delete<T>(path, { headers })
    // Handle 204 No Content responses
    return response.data || { success: true }
  },

  async postForm<T>(path: string, formData: FormData, headers?: Record<string, string>) {
    const response = await apiClient.post<T>(path, formData, {
      headers: {
        ...headers,
        "Content-Type": "multipart/form-data",
      },
    })
    return response.data
  },

  async getBlob(path: string, headers?: Record<string, string>) {
    const response = await apiClient.get<Blob>(path, {
      headers,
      responseType: "blob",
    })
    return response.data
  },
}

export default api
