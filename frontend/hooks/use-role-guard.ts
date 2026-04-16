"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authService } from "@/lib/authService"
import { clearAuthSession, getSessionValue } from "@/lib/browser-session"

type AppRole = "candidate" | "employer"

export function useRoleGuard(expectedRole: AppRole) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let active = true

    const verifyRole = async () => {
      if (typeof window === "undefined") {
        return
      }

      const accessToken = getSessionValue("access_token")
      if (!accessToken) {
        router.replace("/")
        if (active) {
          setAuthorized(false)
          setChecking(false)
        }
        return
      }

      try {
        const me = await authService.getMe()
        const actualRole = me.role === "candidate" ? "candidate" : "employer"

        if (!active) {
          return
        }

        if (actualRole !== expectedRole) {
          setAuthorized(false)
          setChecking(false)
          router.replace(actualRole === "candidate" ? "/candidate" : "/hr")
          return
        }

        setAuthorized(true)
        setChecking(false)
      } catch {
        if (!active) {
          return
        }
        clearAuthSession()
        setAuthorized(false)
        setChecking(false)
        router.replace("/")
      }
    }

    void verifyRole()

    return () => {
      active = false
    }
  }, [expectedRole, router])

  return { authorized, checking }
}
