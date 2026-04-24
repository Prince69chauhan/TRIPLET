"use client"

import type React from "react"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
export function getAuthErrorDetail(err: unknown) {
  if (!err || typeof err !== "object") return null
  const response = "response" in err ? (err as { response?: { data?: unknown } }).response : undefined
  const data = response?.data

  if (data && typeof data === "object" && "detail" in data) {
    return (data as { detail?: unknown }).detail ?? null
  }

  return data ?? null
}

const OTP_SESSION_KEY = "triplet_pending_otp"

export type PendingOtpState = {
  mode: "login" | "signup"
  email: string
  expires_at: number
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function isUnverifiedEmailDetail(detail: unknown): detail is {
  code: string
  message?: string
  email?: string
  expires_in?: number
} {
  return Boolean(
    detail &&
    typeof detail === "object" &&
    "code" in detail &&
    (detail as { code?: unknown }).code === "email_not_verified",
  )
}

export function findUnverifiedEmailDetail(payload: unknown): {
  code: string
  message?: string
  email?: string
  expires_in?: number
} | null {
  const normalized = parseMaybeJson(payload)

  if (isUnverifiedEmailDetail(normalized)) {
    return normalized
  }

  if (normalized && typeof normalized === "object") {
    if ("detail" in normalized) {
      return findUnverifiedEmailDetail((normalized as { detail?: unknown }).detail)
    }
    if ("response" in normalized) {
      return findUnverifiedEmailDetail((normalized as { response?: { data?: unknown } }).response?.data)
    }
    if ("data" in normalized) {
      return findUnverifiedEmailDetail((normalized as { data?: unknown }).data)
    }
  }

  return null
}

export function getDetailMessage(detail: unknown) {
  if (!detail || typeof detail !== "object" || !("message" in detail)) return null
  const message = (detail as { message?: unknown }).message
  return typeof message === "string" ? message : null
}

export function persistPendingOtp(state: PendingOtpState | null) {
  if (typeof window === "undefined") return
  try {
    if (!state) {
      window.sessionStorage.removeItem(OTP_SESSION_KEY)
      return
    }
    window.sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function readPendingOtp(): PendingOtpState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(OTP_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingOtpState
    if (!parsed?.email || !parsed?.mode || !parsed?.expires_at) return null
    if (parsed.expires_at <= Date.now()) {
      window.sessionStorage.removeItem(OTP_SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}


export function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="border-border/80 bg-card/68 backdrop-blur-sm dark:bg-background/20">
      <CardContent className="p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export function LoginForm({ 
  role, 
  showPassword, 
  setShowPassword, 
  isLoading, 
  error,
  onSubmit,
  onSignupClick,
  onForgotPasswordClick
}: { 
  role: string
  showPassword: boolean
  setShowPassword: (show: boolean) => void
  isLoading: boolean
  error: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onSignupClick: () => void
  onForgotPasswordClick: () => void
}) {
  return (
    <Card className="border-border/80 bg-card/82 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-card/94">
      <CardHeader>
        <CardTitle className="text-foreground tracking-[-0.02em]">Sign in as {role === "hr" ? "HR Manager" : "Candidate"}</CardTitle>
        <CardDescription>
          Enter your credentials to access your {role === "hr" ? "recruitment" : "job"} dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${role}-email`} className="text-foreground">Email</Label>
            <Input
              id={`${role}-email`}
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${role}-password`} className="text-foreground">Password</Label>
            <div className="relative">
              <Input
                id={`${role}-password`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                className="bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="rounded border-border bg-input accent-primary" />
              Remember me
            </label>
            <button
              type="button"
              onClick={onForgotPasswordClick}
              className="text-sm text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading}>
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          {error && (
            <div className="text-destructive text-sm text-center mt-2">{error}</div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
