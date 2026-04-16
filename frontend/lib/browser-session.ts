"use client"

const SESSION_KEYS = [
  "access_token",
  "refresh_token",
  "user_role",
  "profile_complete",
] as const

type SessionKey = (typeof SESSION_KEYS)[number]

function hasWindow() {
  return typeof window !== "undefined"
}

function purgeLegacyAuthStorage() {
  if (!hasWindow()) return

  for (const key of SESSION_KEYS) {
    window.localStorage.removeItem(key)
  }
}

export function getSessionValue(key: SessionKey): string | null {
  if (!hasWindow()) return null
  purgeLegacyAuthStorage()
  return window.sessionStorage.getItem(key)
}

export function setSessionValue(key: SessionKey, value: string) {
  if (!hasWindow()) return
  purgeLegacyAuthStorage()
  window.sessionStorage.setItem(key, value)
}

export function removeSessionValue(key: SessionKey) {
  if (!hasWindow()) return
  purgeLegacyAuthStorage()
  window.sessionStorage.removeItem(key)
}

export function clearAuthSession() {
  if (!hasWindow()) return
  purgeLegacyAuthStorage()
  for (const key of SESSION_KEYS) {
    window.sessionStorage.removeItem(key)
  }
}
