"use client"

import { useEffect, useState } from "react"
import { jobService } from "./jobService"
import { notificationService } from "./notificationService"

type Role = "hr" | "candidate"

interface SeenState {
  seenJobIds: string[]
  seenAppsByJob: Record<string, number>
  seenMessagesAt: number
}

interface LiveState {
  currentJobIds: string[]
  currentAppsByJob: Record<string, number>
  unreadMessages: number
}

const STORAGE_KEY = "triplet_badges_seen_v1"
const EVENT = "triplet_badges_changed"

const defaultSeen: SeenState = {
  seenJobIds: [],
  seenAppsByJob: {},
  seenMessagesAt: 0,
}

const defaultLive: LiveState = {
  currentJobIds: [],
  currentAppsByJob: {},
  unreadMessages: 0,
}

let liveState: LiveState = { ...defaultLive }
let pollStarted: Role | null = null

function readSeen(): SeenState {
  if (typeof window === "undefined") return { ...defaultSeen }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultSeen }
    return { ...defaultSeen, ...JSON.parse(raw) }
  } catch {
    return { ...defaultSeen }
  }
}

function writeSeen(next: SeenState) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event(EVENT))
}

function notifyLiveChange() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(EVENT))
}

async function pollHr() {
  try {
    const [analytics, notifs] = await Promise.all([
      jobService.getJobAnalytics({ force: true }).catch(() => []),
      notificationService.getNotifications().catch(() => []),
    ])
    const currentAppsByJob: Record<string, number> = {}
    if (Array.isArray(analytics)) {
      for (const row of analytics as Array<{ job_id: string; total_applications: number }>) {
        currentAppsByJob[row.job_id] = row.total_applications || 0
      }
    }
    const unreadMessages = Array.isArray(notifs)
      ? notifs.filter((n) => n.type === "message" && !n.is_read).length
      : 0
    liveState = {
      currentJobIds: [],
      currentAppsByJob,
      unreadMessages,
    }
    notifyLiveChange()
  } catch {
    // ignore
  }
}

async function pollCandidate() {
  try {
    const [jobsResp, notifs] = await Promise.all([
      jobService.discoverJobs({ page: 1, page_size: 50, force: true }).catch(() => null),
      notificationService.getCandidateNotifications().catch(() => []),
    ])
    const items: any[] = Array.isArray(jobsResp)
      ? jobsResp
      : jobsResp && Array.isArray((jobsResp as any).items)
        ? (jobsResp as any).items
        : []
    const currentJobIds = items.map((j) => String(j.id)).filter(Boolean)
    const unreadMessages = Array.isArray(notifs)
      ? notifs.filter((n) => n.type === "message" && !n.is_read).length
      : 0
    liveState = {
      currentJobIds,
      currentAppsByJob: {},
      unreadMessages,
    }
    notifyLiveChange()
  } catch {
    // ignore
  }
}

export function startBadgePolling(role: Role) {
  if (typeof window === "undefined") return
  if (pollStarted === role) return
  pollStarted = role
  const poll = role === "hr" ? pollHr : pollCandidate
  void poll()
  const id = window.setInterval(() => void poll(), 15000)
  const onFocus = () => void poll()
  window.addEventListener("focus", onFocus)
  // Never cleaned up — lives for session
  void id
}

export interface Badges {
  hasNewJobs: boolean
  hasNewApplications: boolean
  hasNewMessages: boolean
  hasAny: boolean
  isJobNew: (jobId: string) => boolean
  jobHasNewApps: (jobId: string) => boolean
}

export function useBadges(role: Role): Badges {
  const [seen, setSeen] = useState<SeenState>(() => readSeen())
  const [, setTick] = useState(0)

  useEffect(() => {
    startBadgePolling(role)
    const handler = () => {
      setSeen(readSeen())
      setTick((t) => t + 1)
    }
    window.addEventListener(EVENT, handler)
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener("storage", handler)
    }
  }, [role])

  const seenJobSet = new Set(seen.seenJobIds)

  const newJobIds =
    role === "candidate"
      ? liveState.currentJobIds.filter((id) => !seenJobSet.has(id))
      : []

  const jobsWithNewApps =
    role === "hr"
      ? Object.entries(liveState.currentAppsByJob).filter(
          ([jobId, count]) => count > (seen.seenAppsByJob[jobId] ?? 0),
        )
      : []

  const hasNewJobs = newJobIds.length > 0
  const hasNewApplications = jobsWithNewApps.length > 0
  const hasNewMessages = liveState.unreadMessages > 0

  return {
    hasNewJobs,
    hasNewApplications,
    hasNewMessages,
    hasAny: hasNewJobs || hasNewApplications || hasNewMessages,
    isJobNew: (jobId: string) => !seenJobSet.has(jobId) && liveState.currentJobIds.includes(jobId),
    jobHasNewApps: (jobId: string) =>
      (liveState.currentAppsByJob[jobId] ?? 0) > (seen.seenAppsByJob[jobId] ?? 0),
  }
}

export function markJobSeen(jobId: string) {
  const seen = readSeen()
  if (seen.seenJobIds.includes(jobId)) return
  writeSeen({ ...seen, seenJobIds: [...seen.seenJobIds, jobId] })
}

export function markAllJobsSeen() {
  const seen = readSeen()
  const merged = Array.from(new Set([...seen.seenJobIds, ...liveState.currentJobIds]))
  writeSeen({ ...seen, seenJobIds: merged })
}

export function markJobApplicationsSeen(jobId: string) {
  const seen = readSeen()
  const current = liveState.currentAppsByJob[jobId] ?? 0
  writeSeen({
    ...seen,
    seenAppsByJob: { ...seen.seenAppsByJob, [jobId]: current },
  })
}

export function markAllApplicationsSeen() {
  const seen = readSeen()
  writeSeen({
    ...seen,
    seenAppsByJob: { ...seen.seenAppsByJob, ...liveState.currentAppsByJob },
  })
}

export function markMessagesSeen() {
  const seen = readSeen()
  writeSeen({ ...seen, seenMessagesAt: Date.now() })
  // Also mark server-side unread messages as read via notification service.
  void notificationService.markAllRead().catch(() => {})
  void notificationService.markAllCandidateRead().catch(() => {})
  liveState = { ...liveState, unreadMessages: 0 }
  notifyLiveChange()
}
