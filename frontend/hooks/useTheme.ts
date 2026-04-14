"use client"

import { useEffect, useState } from "react"

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  useEffect(() => {
    const stored = localStorage.getItem("triplet_theme") as "dark" | "light" | null
    const initial = stored ?? "dark"
    setTheme(initial)
    applyTheme(initial)
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
    localStorage.setItem("triplet_theme", next)
    applyTheme(next)
  }

  return { theme, toggleTheme }
}