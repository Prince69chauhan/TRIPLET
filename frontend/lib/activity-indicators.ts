"use client"

const INDICATOR_EVENT = "triplet:activity-indicators-updated"

type AvailableJobsState = {
  initialized: boolean
  knownIds: string[]
  unseenIds: string[]
}

type JobApplicationState = {
  initialized: boolean
  knownCounts: Record<string, number>
  unseenJobIds: string[]
}

type JobApplicationSnapshot = {
  jobId: string
  totalApplications: number
}

const EMPTY_AVAILABLE_STATE: AvailableJobsState = {
  initialized: false,
  knownIds: [],
  unseenIds: [],
}

const EMPTY_APPLICATION_STATE: JobApplicationState = {
  initialized: false,
  knownCounts: {},
  unseenJobIds: [],
}

function getScope(role: "candidate" | "hr") {
  if (typeof window === "undefined") return `${role}:server`
  const email = sessionStorage.getItem("userEmail") ?? "anonymous"
  return `${role}:${email.toLowerCase()}`
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function emitIndicatorChange() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(INDICATOR_EVENT))
}

function availableJobsKey(role: "candidate" | "hr") {
  return `triplet:available-jobs-indicator:${getScope(role)}`
}

function jobApplicationsKey(role: "candidate" | "hr") {
  return `triplet:job-applications-indicator:${getScope(role)}`
}

export function subscribeToIndicatorChanges(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("triplet:")) {
      listener()
    }
  }

  window.addEventListener(INDICATOR_EVENT, listener)
  window.addEventListener("storage", handleStorage)

  return () => {
    window.removeEventListener(INDICATOR_EVENT, listener)
    window.removeEventListener("storage", handleStorage)
  }
}

export function syncAvailableJobsIndicator(role: "candidate" | "hr", jobIds: string[]) {
  const key = availableJobsKey(role)
  const current = readJson<AvailableJobsState>(key, EMPTY_AVAILABLE_STATE)
  const uniqueIds = [...new Set(jobIds.filter(Boolean))]

  if (!current.initialized) {
    writeJson(key, {
      initialized: true,
      knownIds: uniqueIds,
      unseenIds: [],
    } satisfies AvailableJobsState)
    return []
  }

  const knownIds = new Set(current.knownIds)
  const unseenIds = new Set(current.unseenIds.filter((jobId) => uniqueIds.includes(jobId)))
  let changed = false

  for (const jobId of uniqueIds) {
    if (!knownIds.has(jobId)) {
      knownIds.add(jobId)
      unseenIds.add(jobId)
      changed = true
    }
  }

  if (changed) {
    writeJson(key, {
      initialized: true,
      knownIds: [...knownIds],
      unseenIds: [...unseenIds],
    } satisfies AvailableJobsState)
    emitIndicatorChange()
  }

  return [...unseenIds]
}

export function getUnseenAvailableJobIds(role: "candidate" | "hr") {
  return readJson<AvailableJobsState>(availableJobsKey(role), EMPTY_AVAILABLE_STATE).unseenIds
}

export function markAvailableJobSeen(role: "candidate" | "hr", jobId: string) {
  const key = availableJobsKey(role)
  const current = readJson<AvailableJobsState>(key, EMPTY_AVAILABLE_STATE)
  if (!current.unseenIds.includes(jobId)) return

  writeJson(key, {
    ...current,
    unseenIds: current.unseenIds.filter((id) => id !== jobId),
  } satisfies AvailableJobsState)
  emitIndicatorChange()
}

export function syncJobApplicationIndicators(role: "candidate" | "hr", jobs: JobApplicationSnapshot[]) {
  const key = jobApplicationsKey(role)
  const current = readJson<JobApplicationState>(key, EMPTY_APPLICATION_STATE)
  const normalized = jobs.filter((job) => Boolean(job.jobId))

  if (!current.initialized) {
    writeJson(key, {
      initialized: true,
      knownCounts: Object.fromEntries(normalized.map((job) => [job.jobId, job.totalApplications])),
      unseenJobIds: [],
    } satisfies JobApplicationState)
    return []
  }

  const knownCounts = { ...current.knownCounts }
  const unseenJobIds = new Set(current.unseenJobIds.filter((jobId) => normalized.some((job) => job.jobId === jobId)))
  let changed = false

  for (const job of normalized) {
    const previousCount = knownCounts[job.jobId] ?? 0
    if (job.totalApplications > previousCount) {
      unseenJobIds.add(job.jobId)
      changed = true
    }
    knownCounts[job.jobId] = job.totalApplications
  }

  if (changed) {
    writeJson(key, {
      initialized: true,
      knownCounts,
      unseenJobIds: [...unseenJobIds],
    } satisfies JobApplicationState)
    emitIndicatorChange()
  } else {
    writeJson(key, {
      initialized: true,
      knownCounts,
      unseenJobIds: [...unseenJobIds],
    } satisfies JobApplicationState)
  }

  return [...unseenJobIds]
}

export function getUnseenJobApplicationIds(role: "candidate" | "hr") {
  return readJson<JobApplicationState>(jobApplicationsKey(role), EMPTY_APPLICATION_STATE).unseenJobIds
}

export function markJobApplicationsSeen(role: "candidate" | "hr", jobId: string) {
  const key = jobApplicationsKey(role)
  const current = readJson<JobApplicationState>(key, EMPTY_APPLICATION_STATE)
  if (!current.unseenJobIds.includes(jobId)) return

  writeJson(key, {
    ...current,
    unseenJobIds: current.unseenJobIds.filter((id) => id !== jobId),
  } satisfies JobApplicationState)
  emitIndicatorChange()
}
