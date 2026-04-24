export type AppTheme = "dark" | "light"

export const LEGACY_THEME_KEY = "triplet_theme"

export function themeKeyForPath(pathname: string | null | undefined): string {
  if (pathname?.startsWith("/hr")) return "triplet_theme_hr"
  if (pathname?.startsWith("/candidate")) return "triplet_theme_candidate"
  return LEGACY_THEME_KEY
}

export function resolveStoredTheme(
  pathname: string | null | undefined,
  read: (key: string) => string | null,
): AppTheme {
  const key = themeKeyForPath(pathname)
  const stored = read(key)
  if (stored === "light" || stored === "dark") return stored

  if (key !== LEGACY_THEME_KEY) {
    const legacy = read(LEGACY_THEME_KEY)
    if (legacy === "light" || legacy === "dark") return legacy
  }

  return "dark"
}

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
    root.classList.remove("light")
  } else {
    root.classList.add("light")
    root.classList.remove("dark")
  }
}
