"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { applyTheme, resolveStoredTheme, themeKeyForPath, type AppTheme } from "@/lib/theme"

export function useTheme() {
  const pathname = usePathname()
  const [theme, setTheme] = useState<AppTheme>("dark")

  useEffect(() => {
    const resolved = resolveStoredTheme(pathname, (key) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    })
    setTheme(resolved)
    applyTheme(resolved)
  }, [pathname])

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    const key = themeKeyForPath(pathname)
    setTheme(next)
    try {
      localStorage.setItem(key, next)
    } catch {}
    applyTheme(next)
  }

  return { theme, toggleTheme }
}
