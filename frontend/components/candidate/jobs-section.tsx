"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { jobService } from "@/lib/jobService"
import { markAvailableJobSeen, subscribeToIndicatorChanges, syncAvailableJobsIndicator } from "@/lib/activity-indicators"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import {
  Briefcase,
  Send,
  Bookmark,
  Search,
  Loader2,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  PauseCircle,
  Ban,
  Eye,
} from "lucide-react"

type JobLifecycleStatus = "active" | "paused" | "removed" | "completed"

interface Job {
  id: string
  title: string
  description: string
  department?: string | null
  employment_type?: string | null
  location?: string | null
  salary?: string | null
  vacancies?: number | null
  required_skills: string[]
  min_tenth_percentage?: number | null
  min_twelfth_percentage?: number | null
  min_cgpa: number | null
  allow_gap: boolean
  max_gap_months?: number | null
  allow_backlogs: boolean
  max_active_backlogs?: number | null
  bonus_skill_in_project?: number | null
  bonus_elite_internship?: number | null
  bonus_project_level?: number | null
  bonus_internship_duration?: number | null
  is_active: boolean
  created_at: string
  min_passout_year?: number
  max_passout_year?: number
  saved_at?: string
  status?: JobLifecycleStatus
}

interface AppliedJob extends Omit<Job, "status" | "saved_at"> {
  application_id: string
  status: string
  applied_at: string
  final_score_d: number | null
  passed_hard_filter: boolean | null
  filter_fail_reason: string | null
  job_status?: string
}

type Tab = "available" | "applied" | "saved"

const WINDOWED_CARD_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "280px",
} as const

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

interface TabListState<T> {
  items: T[]
  total: number
  page: number
  hasMore: boolean
  loaded: boolean
  queryKey: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function formatValue(value: number | string | null | undefined, fallback = "Not specified"): string {
  return value === null || value === undefined || value === "" ? fallback : String(value)
}

function getStatusColor(status: string): string {
  switch (status) {
    case "scored":
      return "bg-green-500/10 text-green-500"
    case "shortlisted":
      return "bg-primary/10 text-primary"
    case "rejected":
      return "bg-red-500/10 text-red-500"
    case "processing":
      return "bg-yellow-500/10 text-yellow-500"
    default:
      return "bg-secondary text-muted-foreground"
  }
}

function getJobLifecycleBadge(status?: JobLifecycleStatus) {
  switch (status) {
    case "paused":
      return {
        label: "Paused",
        className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        icon: PauseCircle,
      }
    case "removed":
      return {
        label: "Removed",
        className: "bg-red-500/10 text-red-500 border-red-500/20",
        icon: Ban,
      }
    case "completed":
      return {
        label: "Completed",
        className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        icon: CheckCircle2,
      }
    default:
      return null
  }
}

const JobCard = memo(function JobCard({
  job,
  tab,
  isSaved,
  isApplied,
  onApply,
  onSave,
  onUnsave,
  onView,
  applying,
  saving,
  showNewDot,
}: {
  job: Job | AppliedJob
  tab: Tab
  isSaved: boolean
  isApplied: boolean
  onApply: (id: string) => void
  onSave: (id: string) => void
  onUnsave: (id: string) => void
  onView: (job: Job | AppliedJob) => void
  applying: string | null
  saving: string | null
  showNewDot?: boolean
}) {
  const appliedJob = job as AppliedJob
  const jobStatus = (tab === "applied" ? appliedJob.job_status : job.status) as JobLifecycleStatus | undefined
  const lifecycleBadge = getJobLifecycleBadge(jobStatus)
  const canApply = jobStatus === undefined || jobStatus === "active"
  const LifecycleIcon = lifecycleBadge?.icon

  return (
    <Card
      className="bg-card border-border hover:border-primary/30 transition-colors"
      style={WINDOWED_CARD_STYLE}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {showNewDot && (
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
              )}
              <h3 className="font-semibold text-foreground text-base">{job.title}</h3>
              {tab === "applied" && (
                <Badge className={`text-xs border-0 ${getStatusColor(appliedJob.status)}`}>
                  {appliedJob.status}
                </Badge>
              )}
              {tab !== "applied" && lifecycleBadge && (
                <Badge className={`text-xs border ${lifecycleBadge.className}`}>
                  {LifecycleIcon && <LifecycleIcon className="h-3 w-3 mr-1" />}
                  {lifecycleBadge.label}
                </Badge>
              )}
            </div>

            {job.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {job.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 mt-3">
              {job.required_skills?.slice(0, 4).map((skill: string) => (
                <Badge key={skill} variant="secondary" className="text-xs bg-secondary text-secondary-foreground">
                  {skill}
                </Badge>
              ))}
              {(job.required_skills?.length || 0) > 4 && (
                <Badge variant="secondary" className="text-xs bg-secondary text-muted-foreground">
                  +{job.required_skills.length - 4}
                </Badge>
              )}
              {job.min_cgpa && (
                <Badge className="text-xs bg-primary/10 text-primary border-0">
                  Min CGPA {job.min_cgpa}
                </Badge>
              )}
              {job.max_passout_year && (
                <Badge className="text-xs bg-secondary text-secondary-foreground border-0">
                  Passout by {job.max_passout_year}
                </Badge>
              )}
              {!job.allow_gap && (
                <Badge className="text-xs bg-secondary text-secondary-foreground border-0">
                  No gap
                </Badge>
              )}
              {!job.allow_backlogs && (
                <Badge className="text-xs bg-secondary text-secondary-foreground border-0">
                  No backlogs
                </Badge>
              )}
            </div>

            {tab === "applied" && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Applied {formatDate(appliedJob.applied_at)}
                </span>
                {appliedJob.final_score_d !== null && (
                  <span className="flex items-center gap-1 text-primary">
                    AI Score: <strong>{appliedJob.final_score_d}%</strong>
                  </span>
                )}
                {appliedJob.passed_hard_filter === false && appliedJob.filter_fail_reason && (
                  <span className="flex items-center gap-1 text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    {appliedJob.filter_fail_reason}
                  </span>
                )}
              </div>
            )}

            {tab === "saved" && "saved_at" in job && job.saved_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Saved {formatDate(job.saved_at)}
              </p>
            )}

            {tab === "saved" && lifecycleBadge && (
              <p className="text-xs mt-2 text-muted-foreground">
                This job is currently {lifecycleBadge.label.toLowerCase()}.
              </p>
            )}

            <p className="text-xs text-muted-foreground mt-1">
              Posted {formatDate(job.created_at)}
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button
              onClick={() => onView(job)}
              variant="outline"
              size="sm"
              className="border-border text-xs text-muted-foreground hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5 mr-1" /> View
            </Button>

            {tab !== "applied" && (
              <button
                onClick={() => (isSaved ? onUnsave(job.id) : onSave(job.id))}
                disabled={saving === job.id}
                className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                title={isSaved ? "Remove from saved" : "Save job"}
              >
                {saving === job.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSaved ? (
                  <BookmarkCheck className="h-4 w-4 text-primary" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </button>
            )}

            {tab !== "applied" && (
              <Button
                onClick={() => onApply(job.id)}
                disabled={applying === job.id || isApplied || !canApply}
                size="sm"
                className="bg-primary text-primary-foreground text-xs px-3"
              >
                {applying === job.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isApplied ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Applied
                  </>
                ) : jobStatus === "paused" ? (
                  "Paused"
                ) : jobStatus === "removed" ? (
                  "Removed"
                ) : jobStatus === "completed" ? (
                  "Completed"
                ) : (
                  "Quick Apply"
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

export function JobsSection() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get("jobsTab")
  const initialTab: Tab = tabFromUrl === "applied" || tabFromUrl === "saved" ? tabFromUrl : "available"
  const emptyJobListState: TabListState<Job> = { items: [], total: 0, page: 1, hasMore: false, loaded: false, queryKey: "" }
  const emptyAppliedListState: TabListState<AppliedJob> = { items: [], total: 0, page: 1, hasMore: false, loaded: false, queryKey: "" }
  const pageSize = 12

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [lists, setLists] = useState<{
    available: TabListState<Job>
    applied: TabListState<AppliedJob>
    saved: TabListState<Job>
  }>({
    available: emptyJobListState,
    applied: emptyAppliedListState,
    saved: emptyJobListState,
  })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [applyError, setApplyError] = useState("")
  const [search, setSearch] = useState("")
  const [locationFilter, setLocationFilter] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [salaryFilter, setSalaryFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [viewJob, setViewJob] = useState<Job | AppliedJob | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [unseenAvailableJobIds, setUnseenAvailableJobIds] = useState<Set<string>>(new Set())
  const debouncedSearch = useDebouncedValue(search, 250)
  const debouncedLocationFilter = useDebouncedValue(locationFilter, 250)
  const debouncedSalaryFilter = useDebouncedValue(salaryFilter, 250)

  useEffect(() => {
    const nextTab: Tab = tabFromUrl === "applied" || tabFromUrl === "saved" ? tabFromUrl : "available"
    setActiveTab(nextTab)
  }, [tabFromUrl])

  useEffect(() => {
    setStatusFilter("all")
  }, [activeTab])

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setApplyError("")
    setStatusFilter("all")
    const params = new URLSearchParams(searchParams.toString())
    params.set("jobsTab", tab)
    router.replace(`${pathname}?${params.toString()}`)
  }, [pathname, router, searchParams])

  const getQueryForTab = useCallback((tab: Tab, useFilters: boolean) => {
    const baseQuery = {
      sort_by: tab === "applied" ? "applied_at" : tab === "saved" ? "saved_at" : "created_at",
      sort_order: "desc" as const,
      page_size: pageSize,
    }

    if (!useFilters) {
      return baseQuery
    }

    return {
      ...baseQuery,
      search: debouncedSearch.trim() || undefined,
      location: debouncedLocationFilter.trim() || undefined,
      department: departmentFilter !== "all" ? departmentFilter : undefined,
      salary: debouncedSalaryFilter.trim() || undefined,
      employment_type: typeFilter !== "all" ? typeFilter : undefined,
      status: statusFilter !== "all" && tab !== "available" ? statusFilter : undefined,
    }
  }, [debouncedLocationFilter, debouncedSalaryFilter, debouncedSearch, departmentFilter, statusFilter, typeFilter])

  const activeQuery = useMemo(() => getQueryForTab(activeTab, true), [activeTab, getQueryForTab])
  const activeQueryKey = useMemo(() => JSON.stringify(activeQuery), [activeQuery])

  const loadRelationshipIds = useCallback(async (force = false) => {
    const [appliedResult, savedResult] = await Promise.allSettled([
      jobService.getAppliedJobs({ force }),
      jobService.getSavedJobs({ force }),
    ])

    if (appliedResult.status === "fulfilled" && Array.isArray(appliedResult.value)) {
      setAppliedIds(new Set(appliedResult.value.map((job: AppliedJob) => job.id)))
    } else {
      setAppliedIds(new Set())
    }

    if (savedResult.status === "fulfilled" && Array.isArray(savedResult.value)) {
      setSavedIds(new Set(savedResult.value.map((job: Job) => job.id)))
    } else {
      setSavedIds(new Set())
    }
  }, [])

  const loadTabPage = useCallback(async (
    tab: Tab,
    page: number,
    {
      append = false,
      force = false,
      query,
    }: {
      append?: boolean
      force?: boolean
      query?: ReturnType<typeof getQueryForTab>
    } = {},
  ) => {
    const effectiveQuery = query ?? getQueryForTab(tab, true)
    const queryKey = JSON.stringify(effectiveQuery)

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      let response: PaginatedResult<Job> | PaginatedResult<AppliedJob>

      if (tab === "available") {
        response = await jobService.discoverJobs({ ...effectiveQuery, page, force }) as PaginatedResult<Job>
      } else if (tab === "applied") {
        response = await jobService.getAppliedJobsPage({ ...effectiveQuery, page, force }) as PaginatedResult<AppliedJob>
      } else {
        response = await jobService.getSavedJobsPage({ ...effectiveQuery, page, force }) as PaginatedResult<Job>
      }

      const items = Array.isArray(response.items) ? response.items : []
      setLists((current) => {
        const existing = current[tab]
        const nextItems = append
          ? [
              ...existing.items,
              ...items.filter((item) => {
                const itemKey = "application_id" in item ? item.application_id : item.id
                return !existing.items.some((existingItem) => {
                  const existingKey = "application_id" in existingItem ? existingItem.application_id : existingItem.id
                  return existingKey === itemKey
                })
              }),
            ]
          : items

        return {
          ...current,
          [tab]: {
            items: nextItems as typeof existing.items,
            total: response.total ?? nextItems.length,
            page: response.page ?? page,
            hasMore: Boolean(response.has_more),
            loaded: true,
            queryKey,
          },
        }
      })
    } catch {
      setLists((current) => ({
        ...current,
        [tab]: {
          ...current[tab],
          items: append ? current[tab].items : [],
          total: append ? current[tab].total : 0,
          page: append ? current[tab].page : 1,
          hasMore: false,
          loaded: true,
          queryKey,
        },
      }))
    } finally {
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }, [getQueryForTab])

  useEffect(() => {
    let cancelled = false

    const loadInitialPages = async () => {
      setLoading(true)
      try {
        const [availableResult, appliedResult, savedResult] = await Promise.allSettled([
          jobService.discoverJobs({ ...getQueryForTab("available", false), page: 1 }),
          jobService.getAppliedJobsPage({ ...getQueryForTab("applied", false), page: 1 }),
          jobService.getSavedJobsPage({ ...getQueryForTab("saved", false), page: 1 }),
          loadRelationshipIds(),
        ])

        if (cancelled) return

        setLists({
          available: availableResult.status === "fulfilled"
            ? {
                items: Array.isArray((availableResult.value as PaginatedResult<Job>).items) ? (availableResult.value as PaginatedResult<Job>).items : [],
                total: (availableResult.value as PaginatedResult<Job>).total ?? 0,
                page: (availableResult.value as PaginatedResult<Job>).page ?? 1,
                hasMore: Boolean((availableResult.value as PaginatedResult<Job>).has_more),
                loaded: true,
                queryKey: JSON.stringify(getQueryForTab("available", false)),
              }
            : emptyJobListState,
          applied: appliedResult.status === "fulfilled"
            ? {
                items: Array.isArray((appliedResult.value as PaginatedResult<AppliedJob>).items) ? (appliedResult.value as PaginatedResult<AppliedJob>).items : [],
                total: (appliedResult.value as PaginatedResult<AppliedJob>).total ?? 0,
                page: (appliedResult.value as PaginatedResult<AppliedJob>).page ?? 1,
                hasMore: Boolean((appliedResult.value as PaginatedResult<AppliedJob>).has_more),
                loaded: true,
                queryKey: JSON.stringify(getQueryForTab("applied", false)),
              }
            : emptyAppliedListState,
          saved: savedResult.status === "fulfilled"
            ? {
                items: Array.isArray((savedResult.value as PaginatedResult<Job>).items) ? (savedResult.value as PaginatedResult<Job>).items : [],
                total: (savedResult.value as PaginatedResult<Job>).total ?? 0,
                page: (savedResult.value as PaginatedResult<Job>).page ?? 1,
                hasMore: Boolean((savedResult.value as PaginatedResult<Job>).has_more),
                loaded: true,
                queryKey: JSON.stringify(getQueryForTab("saved", false)),
              }
            : emptyJobListState,
        })
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadInitialPages()

    const socket = new WebSocket("ws://localhost:8000/ws/jobs")
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.event === "NEW_JOB" || data.event === "JOB_UPDATED") {
        void loadRelationshipIds(true)
        void loadTabPage(activeTab, 1, { force: true, query: getQueryForTab(activeTab, true) })
      }
    }

    return () => {
      cancelled = true
      socket.close()
    }
  }, [activeTab, getQueryForTab, loadRelationshipIds, loadTabPage])

  useEffect(() => {
    const syncIndicators = () => {
      const unseenIds = syncAvailableJobsIndicator(
        "candidate",
        lists.available.items.map((job) => job.id),
      )
      setUnseenAvailableJobIds(new Set(unseenIds))
    }

    syncIndicators()
    return subscribeToIndicatorChanges(syncIndicators)
  }, [lists.available.items])

  useEffect(() => {
    const activeList = lists[activeTab]
    if (!activeList.loaded || activeList.queryKey !== activeQueryKey) {
      void loadTabPage(activeTab, 1, { query: activeQuery })
    }
  }, [activeQuery, activeQueryKey, activeTab, lists, loadTabPage])

  const handleApply = useCallback(async (jdId: string) => {
    setApplying(jdId)
    setApplyError("")
    try {
      await jobService.apply(jdId)
      await loadRelationshipIds(true)
      await loadTabPage("applied", 1, { force: true, query: getQueryForTab("applied", false) })
      if (activeTab === "available") {
        await loadTabPage("available", 1, { force: true, query: activeQuery })
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to apply."
      setApplyError(message === "Network Error" ? "Could not reach the server. Please try again." : message)
    } finally {
      setApplying(null)
    }
  }, [activeQuery, activeTab, getQueryForTab, loadRelationshipIds, loadTabPage])

  const handleSave = useCallback(async (jdId: string) => {
    setSaving(jdId)
    try {
      await jobService.saveJob(jdId)
      await loadRelationshipIds(true)
      await loadTabPage("saved", 1, { force: true, query: getQueryForTab("saved", false) })
      if (activeTab === "available") {
        await loadTabPage("available", 1, { force: true, query: activeQuery })
      }
    } catch {
      // ignore save failures for now
    } finally {
      setSaving(null)
    }
  }, [activeQuery, activeTab, getQueryForTab, loadRelationshipIds, loadTabPage])

  const handleUnsave = useCallback(async (jdId: string) => {
    setSaving(jdId)
    try {
      await jobService.unsaveJob(jdId)
      await loadRelationshipIds(true)
      await loadTabPage("saved", 1, { force: true, query: getQueryForTab("saved", activeTab === "saved") })
      if (activeTab === "available") {
        await loadTabPage("available", 1, { force: true, query: activeQuery })
      }
    } catch {
      // ignore unsave failures for now
    } finally {
      setSaving(null)
    }
  }, [activeQuery, activeTab, getQueryForTab, loadRelationshipIds, loadTabPage])

  const tabs = [
    { id: "available" as Tab, label: "Available Jobs", icon: Briefcase, count: lists.available.total || lists.available.items.length },
    { id: "applied" as Tab, label: "Applications Sent", icon: Send, count: lists.applied.total || lists.applied.items.length },
    { id: "saved" as Tab, label: "Saved Jobs", icon: Bookmark, count: lists.saved.total || lists.saved.items.length },
  ]

  const currentJobs = lists[activeTab].items
  const statusOptions = useMemo(() => {
    if (activeTab === "applied") {
      return [
        { value: "all", label: "All Statuses" },
        { value: "processing", label: "Processing" },
        { value: "shortlisted", label: "Selected" },
        { value: "rejected", label: "Rejected" },
        { value: "removed", label: "Removed" },
      ]
    }
    if (activeTab === "saved") {
      return [
        { value: "all", label: "All Statuses" },
        { value: "removed", label: "Removed" },
      ]
    }
    return [{ value: "all", label: "All Statuses" }]
  }, [activeTab])
  const availableTypes = useMemo(() => Array.from(
    new Map(
      [...lists.available.items, ...lists.applied.items, ...lists.saved.items]
        .map((job) => job.employment_type?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toLowerCase(), value] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b)), [lists])
  const availableDepartments = useMemo(() => Array.from(
    new Map(
      [...lists.available.items, ...lists.applied.items, ...lists.saved.items]
        .map((job) => job.department?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toLowerCase(), value] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b)), [lists])
  const activeList = lists[activeTab]
  const handleLoadMore = useCallback(() => {
    if (!activeList.hasMore || loading || loadingMore) return
    void loadTabPage(activeTab, activeList.page + 1, { append: true, query: activeQuery })
  }, [activeList.hasMore, activeList.page, activeQuery, activeTab, loadTabPage, loading, loadingMore])
  const loadMoreRef = useInfiniteScroll({
    enabled: activeList.hasMore && !loading && !loadingMore,
    onLoadMore: handleLoadMore,
  })
  const lifecycleStatus = viewJob
    ? (("job_status" in viewJob ? viewJob.job_status : viewJob.status) as JobLifecycleStatus | undefined)
    : undefined
  const lifecycleBadge = getJobLifecycleBadge(lifecycleStatus)
  const LifecycleIcon = lifecycleBadge?.icon
  const handleViewJob = useCallback((job: Job | AppliedJob) => {
    setViewJob(job)
    if (activeTab === "available") {
      markAvailableJobSeen("candidate", job.id)
      setUnseenAvailableJobIds((current) => {
        const next = new Set(current)
        next.delete(job.id)
        return next
      })
    }
  }, [activeTab])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <Card
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                cursor-pointer transition-all
                ${isActive
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }
              `}
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? "bg-primary/20" : "bg-secondary"}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${isActive ? "text-primary" : "text-foreground"}`}>
                    {tab.count}
                  </p>
                  <div className="flex items-center gap-2">
                    {(tab.id === "available" && unseenAvailableJobIds.size > 0) && (
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                    )}
                    <p className="text-sm text-muted-foreground">{tab.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs by title, description, or skills..."
            className="bg-card border-border text-foreground pl-10"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row xl:shrink-0">
          <Input
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder="Filter by location"
            className="w-full bg-card border-border text-foreground sm:w-[180px]"
          />
          {activeTab !== "available" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full bg-card border-border text-foreground sm:w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-full bg-card border-border text-foreground sm:w-[170px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Departments</SelectItem>
              {availableDepartments.map((department) => (
                <SelectItem key={department} value={department.toLowerCase()}>
                  {department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full bg-card border-border text-foreground sm:w-[170px]">
              <SelectValue placeholder="Job type" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Types</SelectItem>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type.toLowerCase()}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={salaryFilter}
            onChange={(e) => setSalaryFilter(e.target.value)}
            placeholder="Filter by salary"
            className="w-full bg-card border-border text-foreground sm:w-[180px]"
          />
        </div>
      </div>

      {applyError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {applyError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : currentJobs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center space-y-3">
            {activeTab === "available" && <Briefcase className="h-12 w-12 text-muted-foreground mx-auto" />}
            {activeTab === "applied" && <Send className="h-12 w-12 text-muted-foreground mx-auto" />}
            {activeTab === "saved" && <Bookmark className="h-12 w-12 text-muted-foreground mx-auto" />}
            <p className="font-medium text-foreground">
              {activeTab === "available" && "No jobs available right now"}
              {activeTab === "applied" && "No applications sent yet"}
              {activeTab === "saved" && "No saved jobs yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {activeTab === "available" && "Check back later for new openings"}
              {activeTab === "applied" && "Browse available jobs and hit Quick Apply"}
              {activeTab === "saved" && "Bookmark jobs to save them for later"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {currentJobs.map((job) => (
            <JobCard
              key={"application_id" in job ? job.application_id : job.id}
              job={job}
              tab={activeTab}
              isSaved={savedIds.has(job.id)}
              isApplied={appliedIds.has(job.id)}
              onApply={handleApply}
              onSave={handleSave}
              onUnsave={handleUnsave}
              onView={handleViewJob}
              applying={applying}
              saving={saving}
              showNewDot={activeTab === "available" && unseenAvailableJobIds.has(job.id)}
            />
          ))}
          <div ref={loadMoreRef} className="h-2 w-full" />
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      <Dialog open={!!viewJob} onOpenChange={(open) => !open && setViewJob(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-border bg-card">
          {viewJob && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-foreground">{viewJob.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  {"status" in viewJob && typeof viewJob.status === "string" && activeTab === "applied" && (
                    <Badge className={`text-xs border-0 ${getStatusColor(viewJob.status)}`}>
                      {viewJob.status}
                    </Badge>
                  )}
                  {lifecycleBadge && (
                    <Badge className={`text-xs border ${lifecycleBadge.className}`}>
                      {LifecycleIcon && <LifecycleIcon className="h-3 w-3 mr-1" />}
                      {lifecycleBadge.label}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs bg-secondary text-secondary-foreground">
                    Posted {formatDate(viewJob.created_at)}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Department</p>
                    <p className="text-sm text-foreground break-words">{formatValue(viewJob.department)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Job Type</p>
                    <p className="text-sm text-foreground break-words">{formatValue(viewJob.employment_type)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm text-foreground break-words">{formatValue(viewJob.location)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Salary</p>
                    <p className="text-sm text-foreground break-words">{formatValue(viewJob.salary)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Vacancies</p>
                    <p className="text-sm text-foreground">{formatValue(viewJob.vacancies, "1")}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Job Description</p>
                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap break-words">
                      {viewJob.description || "No description provided."}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Required Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {viewJob.required_skills?.length ? (
                      viewJob.required_skills.map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs bg-secondary text-secondary-foreground">
                          {skill}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No required skills listed.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-sm font-medium text-foreground">Eligibility Criteria</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">10th Minimum</p>
                        <p className="text-sm text-foreground">{formatValue(viewJob.min_tenth_percentage, "No minimum")}%</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">12th Minimum</p>
                        <p className="text-sm text-foreground">{formatValue(viewJob.min_twelfth_percentage, "No minimum")}%</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Minimum CGPA</p>
                        <p className="text-sm text-foreground">{formatValue(viewJob.min_cgpa, "No minimum")}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Passout Range</p>
                        <p className="text-sm text-foreground">
                          {viewJob.min_passout_year || viewJob.max_passout_year
                            ? `${viewJob.min_passout_year ?? "Any"} - ${viewJob.max_passout_year ?? "Any"}`
                            : "Not specified"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-sm font-medium text-foreground">Hiring Rules</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Gap Allowed</p>
                        <p className="text-sm text-foreground">{viewJob.allow_gap ? "Yes" : "No"}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Max Gap Months</p>
                        <p className="text-sm text-foreground">
                          {viewJob.allow_gap ? formatValue(viewJob.max_gap_months, "No limit specified") : "Not applicable"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Backlogs Allowed</p>
                        <p className="text-sm text-foreground">{viewJob.allow_backlogs ? "Yes" : "No"}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Max Active Backlogs</p>
                        <p className="text-sm text-foreground">
                          {viewJob.allow_backlogs ? formatValue(viewJob.max_active_backlogs, "No limit specified") : "Not applicable"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
                  <p className="text-sm font-medium text-foreground">AI Bonus Criteria</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs text-muted-foreground">Skill in Project Bonus</p>
                      <p className="text-sm text-foreground">{formatValue(viewJob.bonus_skill_in_project, "None")}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs text-muted-foreground">Elite Internship Bonus</p>
                      <p className="text-sm text-foreground">{formatValue(viewJob.bonus_elite_internship, "None")}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs text-muted-foreground">Project Level Bonus</p>
                      <p className="text-sm text-foreground">{formatValue(viewJob.bonus_project_level, "None")}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs text-muted-foreground">Internship Duration Bonus</p>
                      <p className="text-sm text-foreground">{formatValue(viewJob.bonus_internship_duration, "None")}</p>
                    </div>
                  </div>
                </div>

                {activeTab === "applied" && "applied_at" in viewJob && (
                  <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
                    <p className="text-sm font-medium text-foreground">Your Application</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Applied On</p>
                        <p className="text-sm text-foreground">{formatDate(viewJob.applied_at)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Application Status</p>
                        <p className="text-sm text-foreground">{formatValue(viewJob.status)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">AI Score</p>
                        <p className="text-sm text-foreground">{formatValue(viewJob.final_score_d, "Pending")}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">Hard Filter</p>
                        <p className="text-sm text-foreground">
                          {viewJob.passed_hard_filter === null
                            ? "Pending"
                            : viewJob.passed_hard_filter
                              ? "Passed"
                              : "Failed"}
                        </p>
                      </div>
                    </div>
                    {viewJob.filter_fail_reason && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                        <p className="text-xs text-red-400">Filter Reason</p>
                        <p className="text-sm text-red-300">{viewJob.filter_fail_reason}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
