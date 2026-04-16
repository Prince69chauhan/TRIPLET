"use client"

import { useEffect, useState } from "react"

const THEME_KEY = "triplet_theme"

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as "dark" | "light" | null
    const resolved = stored === "light" ? "light" : "dark"
    setTheme(resolved)
    applyTheme(resolved)
  }, [])

  function applyTheme(t: "dark" | "light") {
    const root = document.documentElement
    if (t === "dark") {
      root.classList.add("dark")
      root.classList.remove("light")
    } else {
      root.classList.remove("dark")
      root.classList.add("light")
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
  }

  return { theme, toggleTheme }
}