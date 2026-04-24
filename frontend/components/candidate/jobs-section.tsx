"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Tag,
  ClipboardList,
  Calendar,
  MapPin,
  Users2,
  DollarSign,
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

function CandidateDetailSectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ElementType
  title: string
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/50 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  )
}

function CandidateDetailStatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3.5 py-2.5 dark:bg-secondary/20">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground break-keep whitespace-normal">
        {label}
      </span>
      <span className="flex-1 break-keep whitespace-normal text-sm font-bold text-foreground" title={value}>
        {value}
      </span>
    </div>
  )
}

function CandidateDetailInfoCell({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 px-3.5 py-3 dark:bg-background/30">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground break-keep whitespace-normal">{label}</p>
      <div className="break-keep whitespace-normal text-sm font-semibold leading-snug text-foreground">{value}</div>
    </div>
  )
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
      className="bg-card border-border/60 hover:border-primary/25 hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.32)] transition-all duration-200"
      style={WINDOWED_CARD_STYLE}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {showNewDot && (
                <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
              )}
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{job.title}</h3>
              {tab === "applied" && (
                <Badge className={`border-0 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] ${getStatusColor(appliedJob.status)}`}>
                  {appliedJob.status}
                </Badge>
              )}
              {tab !== "applied" && lifecycleBadge && (
                <Badge className={`border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] ${lifecycleBadge.className}`}>
                  {LifecycleIcon && <LifecycleIcon className="mr-1 h-2.5 w-2.5" />}
                  {lifecycleBadge.label}
                </Badge>
              )}
            </div>

            {job.description && (
              <p className="mt-1.5 line-clamp-1 text-[12.5px] text-muted-foreground">
                {job.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.required_skills?.slice(0, 4).map((skill: string) => (
                <Badge key={skill} variant="secondary" className="border-0 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {skill}
                </Badge>
              ))}
              {(job.required_skills?.length || 0) > 4 && (
                <Badge variant="secondary" className="border-0 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  +{job.required_skills.length - 4}
                </Badge>
              )}
              {job.min_cgpa && (
                <Badge className="border-0 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  CGPA {job.min_cgpa}+
                </Badge>
              )}
              {job.max_passout_year && (
                <Badge className="border-0 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  Passout {job.max_passout_year}
                </Badge>
              )}
              {!job.allow_gap && (
                <Badge className="border-0 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  No gap
                </Badge>
              )}
              {!job.allow_backlogs && (
                <Badge className="border-0 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  No backlogs
                </Badge>
              )}
            </div>

            {tab === "applied" && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Applied <span className="font-medium text-foreground/80">{formatDate(appliedJob.applied_at)}</span>
                </span>
                {appliedJob.final_score_d !== null && (
                  <span className="flex items-center gap-1.5 font-semibold text-primary">
                    <Sparkles className="h-3 w-3" /> AI Score: {appliedJob.final_score_d}%
                  </span>
                )}
                {appliedJob.passed_hard_filter === false && appliedJob.filter_fail_reason && (
                  <span className="flex items-center gap-1.5 text-red-500">
                    <AlertCircle className="h-3 w-3" />
                    {appliedJob.filter_fail_reason}
                  </span>
                )}
              </div>
            )}

            {tab === "saved" && "saved_at" in job && job.saved_at && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Saved <span className="font-medium text-foreground/70">{formatDate(job.saved_at)}</span>
              </p>
            )}

            {tab === "saved" && lifecycleBadge && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                This job is currently {lifecycleBadge.label.toLowerCase()}.
              </p>
            )}

            <p className="mt-1.5 text-[10.5px] text-muted-foreground/60">
              Posted {formatDate(job.created_at)}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {tab !== "applied" && (
              <button
                onClick={() => (isSaved ? onUnsave(job.id) : onSave(job.id))}
                disabled={saving === job.id}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                title={isSaved ? "Remove from saved" : "Save job"}
              >
                {saving === job.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isSaved ? (
                  <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            <Button
              onClick={() => onView(job)}
              variant="outline"
              size="sm"
              className="h-8 border-border/60 px-3 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Eye className="mr-1 h-3 w-3" /> View
            </Button>

            {tab !== "applied" && (
              <Button
                onClick={() => onApply(job.id)}
                disabled={applying === job.id || isApplied || !canApply}
                size="sm"
                className="h-8 bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground shadow-[0_2px_10px_color-mix(in_oklch,var(--primary)_22%,transparent)]"
              >
                {applying === job.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isApplied ? (
                  <>
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Applied
                  </>
                ) : jobStatus === "paused" ? (
                  "Paused"
                ) : jobStatus === "removed" ? (
                  "Removed"
                ) : jobStatus === "completed" ? (
                  "Completed"
                ) : (
                  <>
                    <Send className="mr-1 h-3 w-3" /> Quick Apply
                  </>
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
  const viewJobIsApplied = viewJob ? appliedIds.has(viewJob.id) : false
  const viewJobCanApply = lifecycleStatus === undefined || lifecycleStatus === "active"
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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <Card
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                cursor-pointer transition-all duration-200
                ${isActive
                  ? "border-primary/40 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] ring-1 ring-primary/15 shadow-[0_4px_20px_color-mix(in_oklch,var(--primary)_10%,transparent)]"
                  : "border-border/60 bg-card hover:-translate-y-0.5 hover:border-border hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.28)]"
                }
              `}
            >
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] transition-colors ${isActive ? "bg-primary/15 shadow-[0_2px_12px_color-mix(in_oklch,var(--primary)_18%,transparent)]" : "bg-secondary/70"}`}>
                  <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[26px] font-bold leading-none tabular-nums tracking-tight ${isActive ? "text-primary" : "text-foreground"}`}>
                    {tab.count}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {tab.id === "available" && unseenAvailableJobIds.size > 0 && (
                      <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                    )}
                    <p className={`text-[12px] font-medium ${isActive ? "text-primary/85" : "text-muted-foreground"}`}>{tab.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-border/60 bg-card">
        <CardContent className="p-3.5">
          <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs by title, description, or skills..."
                className="h-9 border-border/60 bg-input pl-9 text-[13px] text-foreground placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:shrink-0">
              <Input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Location"
                className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground sm:w-[150px]"
              />
              {activeTab !== "available" && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground sm:w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[13px]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground sm:w-[140px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[13px]">All Departments</SelectItem>
                  {availableDepartments.map((department) => (
                    <SelectItem key={department} value={department.toLowerCase()} className="text-[13px]">
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground sm:w-[140px]">
                  <SelectValue placeholder="Job type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[13px]">All Types</SelectItem>
                  {availableTypes.map((type) => (
                    <SelectItem key={type} value={type.toLowerCase()} className="text-[13px]">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={salaryFilter}
                onChange={(e) => setSalaryFilter(e.target.value)}
                placeholder="Salary"
                className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground sm:w-[120px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {applyError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {applyError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : currentJobs.length === 0 ? (
        <Card className="border-border/60 bg-card">
          <CardContent className="space-y-2.5 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/60">
              {activeTab === "available" && <Briefcase className="h-5 w-5 text-muted-foreground" />}
              {activeTab === "applied" && <Send className="h-5 w-5 text-muted-foreground" />}
              {activeTab === "saved" && <Bookmark className="h-5 w-5 text-muted-foreground" />}
            </div>
            <p className="text-[14.5px] font-semibold text-foreground">
              {activeTab === "available" && "No jobs available right now"}
              {activeTab === "applied" && "No applications sent yet"}
              {activeTab === "saved" && "No saved jobs yet"}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto border-border/70 bg-card p-0 shadow-[0_24px_48px_rgba(15,23,42,0.12)] dark:shadow-[0_32px_64px_rgba(0,0,0,0.5)] sm:w-full">
          {viewJob && (
            <>
              <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md sm:px-7 sm:py-5">
                <div className="flex items-start gap-3 pr-8">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Briefcase className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="break-normal whitespace-normal text-[18px] font-bold leading-snug tracking-tight text-foreground sm:text-[20px]">
                      {viewJob.title}
                    </DialogTitle>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {"status" in viewJob && typeof viewJob.status === "string" && activeTab === "applied" && (
                        <Badge className={`text-xs border-0 ${getStatusColor(viewJob.status)}`}>
                          {viewJob.status}
                        </Badge>
                      )}
                      {lifecycleBadge && (
                        <Badge className={`text-xs border ${lifecycleBadge.className}`}>
                          {LifecycleIcon && <LifecycleIcon className="mr-1 h-3 w-3" />}
                          {lifecycleBadge.label}
                        </Badge>
                      )}
                      <DialogDescription className="m-0 flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span className="whitespace-nowrap">
                          Posted {formatDate(viewJob.created_at)}
                        </span>
                      </DialogDescription>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 px-5 py-5 sm:px-7">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { icon: Calendar, label: "Department", value: formatValue(viewJob.department) },
                    { icon: Briefcase, label: "Job Type", value: formatValue(viewJob.employment_type) },
                    { icon: MapPin, label: "Location", value: formatValue(viewJob.location) },
                    { icon: DollarSign, label: "Salary", value: formatValue(viewJob.salary) },
                    { icon: Users2, label: "Vacancies", value: formatValue(viewJob.vacancies, "1") },
                  ].map((item) => (
                    <CandidateDetailStatRow
                      key={item.label}
                      icon={item.icon}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                </div>

                {viewJob.description && (
                  <div className="space-y-3">
                    <CandidateDetailSectionHeading icon={ClipboardList} title="Job Description" />
                    <p className="break-normal whitespace-pre-wrap px-1 text-[13.5px] leading-relaxed text-foreground/80">
                      {viewJob.description}
                    </p>
                  </div>
                )}

                {viewJob.required_skills?.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 border-b border-border/50 pb-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                        <Tag className="h-4 w-4" />
                      </span>
                      <h3 className="text-sm font-semibold text-foreground">Required Skills</h3>
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">
                        {viewJob.required_skills.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 px-1">
                      {viewJob.required_skills.map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary hover:bg-primary/15"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 dark:bg-secondary/20 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                    <CandidateDetailSectionHeading icon={GraduationCap} title="Eligibility Criteria" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <CandidateDetailInfoCell
                        label="10th Minimum"
                        value={`${formatValue(viewJob.min_tenth_percentage, "No minimum")}%`}
                      />
                      <CandidateDetailInfoCell
                        label="12th Minimum"
                        value={`${formatValue(viewJob.min_twelfth_percentage, "No minimum")}%`}
                      />
                      <CandidateDetailInfoCell
                        label="Min CGPA"
                        value={viewJob.min_cgpa != null ? `${viewJob.min_cgpa} / 10` : "No minimum"}
                      />
                      <CandidateDetailInfoCell
                        label="Passout Range"
                        value={
                          viewJob.min_passout_year || viewJob.max_passout_year
                            ? `${viewJob.min_passout_year ?? "Any"} - ${viewJob.max_passout_year ?? "Any"}`
                            : "Not specified"
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 dark:bg-secondary/20 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                    <CandidateDetailSectionHeading icon={ShieldCheck} title="Hiring Rules" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <CandidateDetailInfoCell label="Gap Allowed" value={viewJob.allow_gap ? "Yes" : "No"} />
                      <CandidateDetailInfoCell
                        label="Max Gap"
                        value={viewJob.allow_gap ? formatValue(viewJob.max_gap_months, "No limit") : "N/A"}
                      />
                      <CandidateDetailInfoCell label="Backlogs Allowed" value={viewJob.allow_backlogs ? "Yes" : "No"} />
                      <CandidateDetailInfoCell
                        label="Max Backlogs"
                        value={viewJob.allow_backlogs ? formatValue(viewJob.max_active_backlogs, "No limit") : "N/A"}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 dark:bg-secondary/20 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                  <CandidateDetailSectionHeading icon={Sparkles} title="AI Bonus Criteria" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <CandidateDetailInfoCell
                      label="Skill in Project"
                      value={formatValue(viewJob.bonus_skill_in_project, "None")}
                    />
                    <CandidateDetailInfoCell
                      label="Elite Internship"
                      value={formatValue(viewJob.bonus_elite_internship, "None")}
                    />
                    <CandidateDetailInfoCell
                      label="Project Level"
                      value={formatValue(viewJob.bonus_project_level, "None")}
                    />
                    <CandidateDetailInfoCell
                      label="Internship Duration"
                      value={formatValue(viewJob.bonus_internship_duration, "None")}
                    />
                  </div>
                </div>

                {activeTab === "applied" && "applied_at" in viewJob && (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 dark:bg-secondary/20 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                    <CandidateDetailSectionHeading icon={ClipboardList} title="Your Application" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                      <CandidateDetailInfoCell label="Applied On" value={formatDate(viewJob.applied_at)} />
                      <CandidateDetailInfoCell label="Application Status" value={formatValue(viewJob.status)} />
                      <CandidateDetailInfoCell label="AI Score" value={formatValue(viewJob.final_score_d, "Pending")} />
                      <CandidateDetailInfoCell
                        label="Hard Filter"
                        value={
                          viewJob.passed_hard_filter === null
                            ? "Pending"
                            : viewJob.passed_hard_filter
                              ? "Passed"
                              : "Failed"
                        }
                      />
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

              {activeTab !== "applied" && (
                <div className="sticky bottom-0 z-10 border-t border-border/50 bg-card/97 px-5 py-3.5 backdrop-blur-xl sm:px-7">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[12.5px] text-muted-foreground">
                      {viewJobIsApplied
                        ? "You have already applied to this job."
                        : lifecycleStatus === "paused"
                          ? "This job is paused and not accepting new applications right now."
                          : lifecycleStatus === "removed"
                            ? "This job has been removed and is no longer accepting applications."
                            : lifecycleStatus === "completed"
                              ? "This hiring process is completed."
                              : "Ready to apply? Submit your application directly from this panel."}
                    </p>
                    <Button
                      onClick={() => handleApply(viewJob.id)}
                      disabled={applying === viewJob.id || viewJobIsApplied || !viewJobCanApply}
                      className="min-w-[170px] bg-primary text-primary-foreground"
                    >
                      {applying === viewJob.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Applying...
                        </>
                      ) : viewJobIsApplied ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Applied
                        </>
                      ) : lifecycleStatus === "paused" ? (
                        "Paused"
                      ) : lifecycleStatus === "removed" ? (
                        "Removed"
                      ) : lifecycleStatus === "completed" ? (
                        "Completed"
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Quick Apply
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
