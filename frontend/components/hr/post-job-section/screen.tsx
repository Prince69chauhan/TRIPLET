"use client"

import dynamic from "next/dynamic"
import { memo, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper"
import { jobService } from "@/lib/jobService"
import { markJobApplicationsSeen, subscribeToIndicatorChanges, syncJobApplicationIndicators } from "@/lib/activity-indicators"
import { getJobVisual } from "@/lib/job-visuals"
import { cn } from "@/lib/utils"
import {
  Briefcase,
  CheckCircle2,
  X,
  Plus,
  Sparkles,
  Send,
  Search,
  Play,
  Pause,
  Trash2,
  Eye,
  GraduationCap,
  Loader2,
  ArchiveX,
  AlertCircle,
  Pencil,
  Building2,
  MapPin,
  Wallet,
  FileText,
  SlidersHorizontal,
  Layers3,
  Clock3,
  MoreHorizontal,
  Users2,
  type LucideIcon,
} from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSwipeTabNavigation } from "@/hooks/use-swipe-tab-navigation"

import {
  JobListTab,
  SectionPanel,
  StatusBadge,
  MetaPill,
  canOpenRankingForJob,
  getPendingActionCopy,
} from "./shared"
import type {
  Counts,
  Job,
  JobStatus,
  ManagedJobsResponse,
  PendingJobAction,
  TabType,
} from "./shared"

const JobDetailDialog = dynamic(
  () => import("@/components/hr/job-detail-dialog").then((module) => module.JobDetailDialog),
  { ssr: false },
)

const EMPTY_FORM_DATA = {
  title           : "",
  department      : "",
  type            : "",
  location        : "",
  salary          : "",
  description     : "",
  vacancies       : "1",
  min_tenth       : "",
  min_twelfth     : "",
  min_passout_year: "",
  max_passout_year: "",
}

export function PostJobSection() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()
  const tabFromUrl = searchParams.get("hrJobTab")
  const postFocus = searchParams.get("postFocus")
  const postJump = searchParams.get("postJump")
  const initialTab: TabType =
    tabFromUrl === "posted" || tabFromUrl === "active" || tabFromUrl === "inactive" || tabFromUrl === "past"
      ? tabFromUrl
      : "post"

  const [activeTab, setActiveTab]     = useState<TabType>(initialTab)
  const [counts, setCounts]           = useState<Counts>({ posted: 0, active: 0, inactive: 0, past: 0, total: 0 })
  const [jobs, setJobs]               = useState<Job[]>([])
  const [recentJobs, setRecentJobs]   = useState<Job[]>([])
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [updating, setUpdating]       = useState<string | null>(null)
  const [viewJob, setViewJob]         = useState<Job | null>(null)
  const [editingJob, setEditingJob]   = useState<Job | null>(null)
  const [editReturnTab, setEditReturnTab] = useState<TabType>("inactive")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [jobSearch, setJobSearch]     = useState("")
  const [filterMode, setFilterMode]   = useState<"all" | "with_cgpa" | "with_skills">("all")
  const [jobPage, setJobPage]         = useState(1)
  const [jobTotal, setJobTotal]       = useState(0)
  const [hasMoreJobs, setHasMoreJobs] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [pendingAction, setPendingAction] = useState<PendingJobAction | null>(null)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [unseenApplicationJobIds, setUnseenApplicationJobIds] = useState<Set<string>>(new Set())
  const [desktopAnalytics, setDesktopAnalytics] = useState({
    totalApplications: 0,
    shortlisted: 0,
    shortlistedRoles: 0,
    newApplicationsToday: 0,
  })
  const formSectionRef = useRef<HTMLDivElement | null>(null)
  const jobListSectionRef = useRef<HTMLDivElement | null>(null)

  // Form state — matches original photo layout
  const [skills, setSkills]           = useState<string[]>([])
  const [newSkill, setNewSkill]       = useState("")
  const [minCgpa, setMinCgpa]         = useState("")
  const [allowGap, setAllowGap]       = useState(false)
  const [allowBacklogs, setAllowBacklogs] = useState(false)
  const [isRemote, setIsRemote]       = useState(false)
  const [formData, setFormData]       = useState(EMPTY_FORM_DATA)
  const debouncedJobSearch = useDebouncedValue(jobSearch, 250)
  const managedQuery = useMemo(() => ({
    status     : activeTab,
    search     : debouncedJobSearch.trim() || undefined,
    filter_mode: filterMode,
    sort_by    : "created_at",
    sort_order : "desc" as const,
    page_size  : 10,
  }), [activeTab, debouncedJobSearch, filterMode])
  const managedQueryKey = useMemo(() => JSON.stringify(managedQuery), [managedQuery])

  // ── Data fetching ──
  const loadCounts = useCallback(async (force = false) => {
    try {
      const data = await jobService.getJobCounts({ force })
      setCounts(data as Counts)
    } catch { /* ignore */ }
  }, [])

  const loadJobs = useCallback(async (
    tab: TabType,
    page = 1,
    options: {
      append?: boolean
      force?: boolean
      search?: string
      filterMode?: "all" | "with_cgpa" | "with_skills"
    } = {},
  ) => {
    if (tab === "post") return
    const append = options.append ?? false
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const data = await jobService.getManagedJobs({
        status     : tab,
        search     : options.search ?? (debouncedJobSearch.trim() || undefined),
        filter_mode: options.filterMode ?? filterMode,
        sort_by    : "created_at",
        sort_order : "desc",
        page,
        page_size  : managedQuery.page_size,
        force      : options.force,
      }) as ManagedJobsResponse

      const nextJobs = Array.isArray(data.items) ? data.items : []
      setJobs((current) => {
        if (!append) return nextJobs
        return [
          ...current,
          ...nextJobs.filter((job) => !current.some((existing) => existing.id === job.id)),
        ]
      })
      setJobTotal(typeof data.total === "number" ? data.total : nextJobs.length)
      setJobPage(typeof data.page === "number" ? data.page : page)
      setHasMoreJobs(Boolean(data.has_more))
    } catch {
      if (!append) {
        setJobs([])
        setJobTotal(0)
        setJobPage(1)
        setHasMoreJobs(false)
      }
    } finally {
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }, [debouncedJobSearch, filterMode, managedQuery.page_size])

  const loadRecent = useCallback(async (force = false) => {
    try {
      const data = await jobService.getRecentJobs({ force })
      setRecentJobs(Array.isArray(data) ? (data as Job[]) : [])
    } catch { setRecentJobs([]) }
  }, [])

  useEffect(() => {
    loadCounts()
    loadRecent()
  }, [loadCounts, loadRecent])

  useEffect(() => {
    let active = true

    const loadApplicationIndicators = async () => {
      try {
        const [stats, dailyApplications] = await Promise.all([
          jobService.getJobAnalytics({ force: true }) as Promise<Array<{
            job_id: string
            total_applications: number
            shortlisted?: number
          }>>,
          jobService.getDailyApplications({ force: true }) as Promise<Array<{
            date: string
            applications: number
          }>>,
        ])
        if (!active) return
        const safeStats = Array.isArray(stats) ? stats : []
        const today = new Date().toISOString().slice(0, 10)
        const unseenIds = syncJobApplicationIndicators(
          "hr",
          safeStats.map((job) => ({ jobId: job.job_id, totalApplications: job.total_applications ?? 0 })),
        )
        setUnseenApplicationJobIds(new Set(unseenIds))
        setDesktopAnalytics({
          totalApplications: safeStats.reduce((sum, job) => sum + (job.total_applications ?? 0), 0),
          shortlisted: safeStats.reduce((sum, job) => sum + (job.shortlisted ?? 0), 0),
          shortlistedRoles: safeStats.filter((job) => (job.shortlisted ?? 0) > 0).length,
          newApplicationsToday: Array.isArray(dailyApplications)
            ? dailyApplications.find((entry) => entry.date === today)?.applications ?? 0
            : 0,
        })
      } catch {
        if (active) {
          setUnseenApplicationJobIds(new Set())
          setDesktopAnalytics({
            totalApplications: 0,
            shortlisted: 0,
            shortlistedRoles: 0,
            newApplicationsToday: 0,
          })
        }
      }
    }

    void loadApplicationIndicators()
    const interval = window.setInterval(() => {
      void loadApplicationIndicators()
    }, 5_000)
    const unsubscribe = subscribeToIndicatorChanges(() => {
      void loadApplicationIndicators()
    })

    return () => {
      active = false
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const nextTab: TabType =
      tabFromUrl === "posted" || tabFromUrl === "active" || tabFromUrl === "inactive" || tabFromUrl === "past"
        ? tabFromUrl
        : "post"
    setActiveTab(nextTab)
  }, [tabFromUrl])

  const scrollToTarget = useCallback((target: "form" | "list") => {
    const element = target === "form" ? formSectionRef.current : jobListSectionRef.current
    if (!element) return
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  useEffect(() => {
    if (postFocus === "form" && activeTab === "post") {
      scrollToTarget("form")
    }
    if (postFocus === "list" && activeTab !== "post") {
      scrollToTarget("list")
    }
  }, [activeTab, postFocus, postJump, scrollToTarget])

  useEffect(() => {
    setSelectedJobIds([])
    setSelectionMode(false)
  }, [activeTab])

  useEffect(() => {
    setSelectedJobIds([])
  }, [managedQueryKey])

  useEffect(() => {
    if (activeTab === "post") return
    void loadJobs(activeTab, 1)
  }, [activeTab, loadJobs, managedQueryKey])

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8000/ws/jobs")

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.event === "NEW_JOB" || data.event === "JOB_UPDATED") {
        loadCounts(true)
        loadRecent(true)
        if (activeTab !== "post") {
          loadJobs(activeTab, 1, { force: true })
        }
      }
    }

    return () => socket.close()
  }, [activeTab, loadCounts, loadRecent, loadJobs])

  const handleTabChange = (tab: TabType, focusTarget?: "form" | "list") => {
    const sameTab = activeTab === tab
    if (!sameTab) {
      setActiveTab(tab)
      setJobs([])
      setJobPage(1)
      setJobTotal(0)
      setHasMoreJobs(false)
      setSelectedJobIds([])
      setSelectionMode(false)
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set("hrJobTab", tab)
    if (focusTarget) {
      params.set("postFocus", focusTarget)
      params.set("postJump", String(Date.now()))
    } else {
      params.delete("postFocus")
      params.delete("postJump")
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  const requestStatusChange = useCallback((jobIds: string[], status: Extract<JobStatus, "active" | "paused">) => {
    if (jobIds.length === 0) return
    setPendingAction({ kind: "status", jobIds, status })
  }, [])

  const requestRemove = useCallback((jobIds: string[]) => {
    if (jobIds.length === 0) return
    setPendingAction({ kind: "remove", jobIds })
  }, [])

  const handleStatusChange = useCallback((jdId: string, status: JobStatus) => {
    if (status !== "active" && status !== "paused") return
    requestStatusChange([jdId], status)
  }, [requestStatusChange])

  const handleRemove = useCallback((jdId: string) => {
    requestRemove([jdId])
  }, [requestRemove])

  const handleOpenRanking = useCallback((job: Job) => {
    markJobApplicationsSeen("hr", job.id)
    setUnseenApplicationJobIds((current) => {
      const next = new Set(current)
      next.delete(job.id)
      return next
    })
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", "ranking")
    params.set("rankingJob", job.id)
    router.push(`/hr?${params.toString()}`)
  }, [router, searchParams])

  const handleToggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => {
      const next = !current
      if (!next) {
        setSelectedJobIds([])
      }
      return next
    })
  }, [])

  const handleToggleSelectJob = useCallback((jdId: string) => {
    setSelectedJobIds((current) =>
      current.includes(jdId)
        ? current.filter((id) => id !== jdId)
        : [...current, jdId],
    )
  }, [])

  const handleSelectVisibleJobs = useCallback(() => {
    setSelectedJobIds((current) => (
      jobs.length > 0 && jobs.every((job) => current.includes(job.id))
        ? []
        : jobs.map((job) => job.id)
    ))
  }, [jobs])

  const handleClearSelection = useCallback(() => {
    setSelectedJobIds([])
  }, [])

  const handleConfirmPendingAction = useCallback(async () => {
    if (!pendingAction) return

    const { errorMessage, successMessage } = getPendingActionCopy(pendingAction)
    const isSingle = pendingAction.jobIds.length === 1

    setSubmitError(null)
    setSuccessMessage(null)

    if (isSingle) {
      setUpdating(pendingAction.jobIds[0])
    } else {
      setBulkUpdating(true)
    }

    try {
      if (pendingAction.kind === "remove") {
        await Promise.all(
          pendingAction.jobIds.map((jobId) => jobService.updateJobStatus(jobId, "removed")),
        )
      } else if (pendingAction.status) {
        await Promise.all(
          pendingAction.jobIds.map((jobId) => jobService.updateJobStatus(jobId, pendingAction.status!)),
        )
      }

      await loadJobs(activeTab, 1, { force: true })
      await loadCounts(true)
      await loadRecent(true)
      setSelectedJobIds((current) => current.filter((jobId) => !pendingAction.jobIds.includes(jobId)))
      setSuccessMessage(successMessage)
      setTimeout(() => setSuccessMessage(null), 3000)
      setPendingAction(null)
    } catch {
      setSubmitError(errorMessage)
    } finally {
      setUpdating(null)
      setBulkUpdating(false)
    }
  }, [activeTab, loadCounts, loadJobs, loadRecent, pendingAction])

  const resetJobForm = useCallback(() => {
    setEditingJob(null)
    setSkills([])
    setNewSkill("")
    setMinCgpa("")
    setAllowGap(false)
    setAllowBacklogs(false)
    setIsRemote(false)
    setFormData(EMPTY_FORM_DATA)
  }, [])

  const handleEditJob = useCallback((job: Job) => {
    setEditingJob(job)
    setEditReturnTab(activeTab === "post" ? "inactive" : activeTab)
    setSubmitError(null)
    setSuccessMessage(null)
    setSkills(job.required_skills ?? [])
    setNewSkill("")
    setMinCgpa(job.min_cgpa !== null && job.min_cgpa !== undefined ? String(job.min_cgpa) : "")
    setAllowGap(Boolean(job.allow_gap))
    setAllowBacklogs(Boolean(job.allow_backlogs))
    setIsRemote(false)
    setFormData({
      title           : job.title ?? "",
      department      : job.department ?? "",
      type            : job.employment_type ?? "",
      location        : job.location ?? "",
      salary          : job.salary ?? "",
      description     : job.description ?? "",
      vacancies       : String(job.vacancies ?? 1),
      min_tenth       : job.min_tenth_percentage !== null && job.min_tenth_percentage !== undefined ? String(job.min_tenth_percentage) : "",
      min_twelfth     : job.min_twelfth_percentage !== null && job.min_twelfth_percentage !== undefined ? String(job.min_twelfth_percentage) : "",
      min_passout_year: job.min_passout_year !== null && job.min_passout_year !== undefined ? String(job.min_passout_year) : "",
      max_passout_year: job.max_passout_year !== null && job.max_passout_year !== undefined ? String(job.max_passout_year) : "",
    })
    handleTabChange("post", "form")
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [activeTab])
  const handleCloseViewJob = useCallback(() => {
    setViewJob(null)
  }, [])

  const handleLoadMore = useCallback(() => {
    if (activeTab === "post" || !hasMoreJobs || loading || loadingMore) return
    void loadJobs(activeTab, jobPage + 1, { append: true })
  }, [activeTab, hasMoreJobs, jobPage, loadJobs, loading, loadingMore])

  const loadMoreRef = useInfiniteScroll({
    enabled: activeTab !== "post" && hasMoreJobs && !loading && !loadingMore,
    onLoadMore: handleLoadMore,
  })

  const addSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills(prev => [...prev, newSkill.trim()])
      setNewSkill("")
    }
  }

  const removeSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)
    setSuccessMessage(null)

    if (!formData.type.trim()) {
      setSubmitError("Select a job type before posting.")
      setIsSubmitting(false)
      return
    }

    if (!formData.department.trim()) {
      setSubmitError("Select a department before posting.")
      setIsSubmitting(false)
      return
    }

    if (!formData.location.trim()) {
      setSubmitError("Add a location before posting.")
      setIsSubmitting(false)
      return
    }

    if (!formData.salary.trim()) {
      setSubmitError("Add a salary before posting.")
      setIsSubmitting(false)
      return
    }

    if (skills.length === 0) {
      setSubmitError("Add at least one required skill before posting the job.")
      setIsSubmitting(false)
      return
    }

    const payload = {
        title                    : formData.title,
        description              : formData.description,
        department               : formData.department || null,
        employment_type          : formData.type || null,
        location                 : formData.location || null,
        salary                   : formData.salary || null,
        vacancies                : parseInt(formData.vacancies) || 1,
        required_skills          : skills,
        min_tenth_percentage     : formData.min_tenth ? parseFloat(formData.min_tenth) : null,
        min_twelfth_percentage   : formData.min_twelfth ? parseFloat(formData.min_twelfth) : null,
        min_cgpa                 : minCgpa ? parseFloat(minCgpa) : null,
        min_passout_year         : formData.min_passout_year ? parseInt(formData.min_passout_year) : null,
        max_passout_year         : formData.max_passout_year ? parseInt(formData.max_passout_year) : null,
        allow_gap                : allowGap,
        max_gap_months           : editingJob?.max_gap_months ?? 0,
        allow_backlogs           : allowBacklogs,
        max_active_backlogs      : editingJob?.max_active_backlogs ?? 0,
        bonus_skill_in_project   : editingJob?.bonus_skill_in_project ?? 5,
        bonus_elite_internship   : editingJob?.bonus_elite_internship ?? 10,
        bonus_project_level      : editingJob?.bonus_project_level ?? 5,
        bonus_internship_duration: editingJob?.bonus_internship_duration ?? 3,
      }

    try {
      if (editingJob) {
        await jobService.updateJob(editingJob.id, payload)
        resetJobForm()
        setSuccessMessage("Paused job updated. You can resume it now.")
        await loadCounts(true)
        await loadRecent(true)
        handleTabChange(editReturnTab)
      } else {
        await jobService.createJob(payload)
        resetJobForm()
        setSuccessMessage("Job posted successfully!")
      }
      await loadCounts(true)
      await loadRecent(true)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: unknown) {
      console.error("[PostJob] createJob failed:", err)
      const axiosErr = err as { response?: { data?: { detail?: string; message?: string } }; message?: string }
      const detail =
        axiosErr?.response?.data?.detail ||
        axiosErr?.response?.data?.message ||
        axiosErr?.message ||
        "Something went wrong. Please try again."
      setSubmitError(typeof detail === "string" ? detail : JSON.stringify(detail))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Tab config ──
  const tabs: { id: TabType; label: string; icon: React.ElementType; count: number | null }[] = [
    { id: "post",     label: "Post a Job",    icon: Plus,         count: null           },
    { id: "posted",   label: "Posted Jobs",   icon: Briefcase,    count: counts.posted  },
    { id: "active",   label: "Active Jobs",   icon: CheckCircle2, count: counts.active  },
    { id: "inactive", label: "Inactive Jobs", icon: Pause,        count: counts.inactive },
    { id: "past",     label: "Past Jobs",     icon: ArchiveX,     count: counts.past    },
  ]

  const swipeHandlers = useSwipeTabNavigation<TabType>({
    tabs: tabs.map((tab) => tab.id),
    activeTab,
    onChange: (tab) => handleTabChange(tab, tab === "post" ? "form" : "list"),
    enabled: isMobile,
  })

  const tabColors: Record<TabType, string> = {
    post    : "text-primary border-primary bg-primary/10",
    posted  : "text-blue-400 border-blue-400/40 bg-blue-400/10",
    active  : "text-green-500 border-green-500/40 bg-green-500/10",
    inactive: "text-yellow-500 border-yellow-500/40 bg-yellow-500/10",
    past    : "text-gray-400 border-gray-400/40 bg-gray-400/10",
  }
  const tabDescriptions: Record<TabType, string> = {
    post: "Create a new role with the exact filters and skills your team needs.",
    posted: "See every role you have created and review details quickly.",
    active: "Monitor the jobs that are currently open for applications.",
    inactive: "Edit and resume paused roles when you are ready to reopen them.",
    past: "Keep removed and completed jobs available for reference and audits.",
  }
  const hasIndicatorForTab = (tabId: TabType) => {
    if (tabId === "post" || tabId === "past") return false
    if (tabId === "posted") return unseenApplicationJobIds.size > 0
    const desiredStatus = tabId === "active" ? "active" : "paused"
    const sourceJobs = activeTab === tabId ? jobs : recentJobs
    return sourceJobs.some((job) => job.status === desiredStatus && unseenApplicationJobIds.has(job.id))
  }
  const recentActiveThisWeek = useMemo(
    () => recentJobs.filter((job) => job.status === "active" && Date.now() - new Date(job.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length,
    [recentJobs],
  )
  const desktopOverviewCards = [
    {
      label: "Active Jobs",
      value: counts.active,
      hint: `+${recentActiveThisWeek} this week`,
    },
    {
      label: "Total Applications",
      value: desktopAnalytics.totalApplications,
      hint: `+${desktopAnalytics.newApplicationsToday} new today`,
    },
    {
      label: "Shortlisted",
      value: desktopAnalytics.shortlisted,
      hint: `across ${desktopAnalytics.shortlistedRoles} roles`,
    },
  ] as const

  return (
    <div className="space-y-4 sm:space-y-6" {...swipeHandlers} style={isMobile ? { touchAction: "pan-y" } : undefined}>
      {isMobile ? (
        <Card className="border-border/90 bg-card/94 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:bg-card/88">
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Hiring dashboard</p>
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-foreground">Track hiring performance at a glance</h2>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Review live roles, monitor application flow, and keep shortlisted momentum visible from one compact view.
                </p>
              </div>

              <div className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {desktopOverviewCards.map((card) => (
                  <div
                    key={card.label}
                    className="min-w-[220px] snap-start rounded-[1.25rem] border border-border/80 bg-card/98 px-4 py-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
                  >
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-foreground/78">
                      {card.label}
                    </p>
                    <p className="mt-2.5 text-[30px] font-bold leading-none tracking-[-0.05em] text-foreground tabular-nums">
                      {card.value}
                    </p>
                    <p className="mt-2 text-[12px] font-medium leading-relaxed text-muted-foreground">
                      {card.hint}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border/80 bg-secondary/60 px-3 py-1.5 font-medium text-foreground/88">
                  {counts.total} total jobs
                </span>
                <span className="rounded-full border border-border/80 bg-secondary/60 px-3 py-1.5">
                  Swipe cards to review more
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {desktopOverviewCards.map((card) => {
            return (
              <Card key={card.label} className="border-border/70 bg-card/96 py-0 shadow-[0_10px_24px_rgba(15,23,42,0.05)] dark:bg-card/90">
                <CardContent className="p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/78">
                    {card.label}
                  </p>
                  <p className="mt-3 text-4xl font-bold tracking-[-0.05em] text-foreground tabular-nums">
                    {card.value}
                  </p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    {card.hint}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Tab buttons ── */}
      {isMobile ? (
        <div className="grid grid-cols-5 gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id, tab.id === "post" ? "form" : "list")}
                aria-label={tab.label}
                className={`rounded-2xl border px-2 py-2.5 text-center transition-all ${isActive ? tabColors[tab.id] : "border-border/70 bg-card/92 text-muted-foreground"}`}
              >
                <div className="relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/65">
                  {hasIndicatorForTab(tab.id) && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                  )}
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                  {tab.id === "post" ? "Post" : tab.id === "posted" ? "All" : tab.id === "active" ? "Live" : tab.id === "inactive" ? "Paused" : "Past"}
                </p>
                <p className="mt-0.5 text-[11px] font-bold leading-none tabular-nums">{tab.count ?? "+"}</p>
              </button>
            )
          })}
        </div>
      ) : (
        <Card className="border-border/70 bg-card/96 py-0 shadow-[0_10px_24px_rgba(15,23,42,0.05)] dark:bg-card/90">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {tabs.map(tab => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <TooltipWrapper key={tab.id} content={tabDescriptions[tab.id]}>
                      <button
                        type="button"
                        onClick={() => handleTabChange(tab.id, tab.id === "post" ? "form" : "list")}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold transition-all ${
                          isActive
                            ? "border-primary/30 bg-primary text-primary-foreground shadow-[0_6px_16px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                            : "border-border/70 bg-secondary/60 text-muted-foreground hover:border-primary/20 hover:text-foreground"
                        }`}
                      >
                        <span className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-black/10 text-current dark:bg-white/10">
                          {hasIndicatorForTab(tab.id) && (
                            <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                          )}
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span>{tab.id === "post" ? "Post" : tab.label.replace(" Jobs", "")}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                          isActive ? "bg-black/10 text-primary-foreground dark:bg-white/12" : "bg-background/90 text-foreground"
                        }`}>
                          {tab.count ?? "+"}
                        </span>
                      </button>
                    </TooltipWrapper>
                  )
                })}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded-2xl border border-border/70 bg-secondary/60 px-3 py-2 font-medium text-foreground/88">
                  {counts.total} total jobs
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Post Job tab ── */}
      {activeTab === "post" && (
        <div ref={formSectionRef} className="grid grid-cols-1 gap-6 scroll-mt-24 lg:grid-cols-2">

          {/* ── Post New Job form — matches photo exactly ── */}
          <Card className="border-border/90 bg-card/94 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:bg-card/88">
            <CardHeader>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Create Listing</p>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-foreground">Post New Job</CardTitle>
                <TooltipWrapper
                  content={editingJob
                    ? "Update this paused role here, then resume it when you want candidates to start applying again."
                    : "Create a new role with the exact inputs, skills, and candidate filters your team wants to publish."}
                  className="w-auto"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-card/80 text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </span>
                </TooltipWrapper>
              </div>
            </CardHeader>
            <CardContent>
              {successMessage && (
                <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-green-500/10 text-green-500 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> {successMessage}
                </div>
              )}
              {submitError && (
                <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
              {editingJob && (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-500">
                  <div>
                    <p className="font-medium">Editing paused job</p>
                    <p className="text-xs text-yellow-500/80">{editingJob.title}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetJobForm}
                    className="border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
                  >
                    Cancel Edit
                  </Button>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-6">
                  <SectionPanel
                    icon={Briefcase}
                    title="Role essentials"
                    description="Define the job identity, where it sits, and the compensation details candidates should see first."
                  >

                {/* Job Title */}
                <div className="space-y-3">
                  <Label htmlFor="title" className="text-foreground">Job Title</Label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Senior Software Engineer"
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                </div>

                {/* Department + Employment Type */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <Label htmlFor="department" className="text-foreground">Department</Label>
                    <Select
                      value={formData.department}
                      onValueChange={value => setFormData({ ...formData, department: value })}
                    >
                      <SelectTrigger className="bg-input border-border text-foreground">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="Engineering">Engineering</SelectItem>
                        <SelectItem value="Design">Design</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Sales">Sales</SelectItem>
                        <SelectItem value="Human Resources">Human Resources</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="type" className="text-foreground">Employment Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={value => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger className="bg-input border-border text-foreground">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Internship">Internship</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Location + Salary */}
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <Label htmlFor="location" className="text-foreground">Location</Label>
                    <Input
                      id="location"
                      name="location"
                      value={formData.location}
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                      placeholder="e.g. San Francisco, CA"
                      className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="salary" className="text-foreground">Salary Range</Label>
                    <Input
                      id="salary"
                      name="salary"
                      value={formData.salary}
                      onChange={e => setFormData({ ...formData, salary: e.target.value })}
                      placeholder="e.g. $120k - $160k"
                      className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                </div>

                {/* Number of Vacancies */}
                <div className="space-y-3">
                  <Label htmlFor="vacancies" className="text-foreground">Number of Vacancies</Label>
                  <Input
                    id="vacancies"
                    name="vacancies"
                    type="number"
                    min="1"
                    value={formData.vacancies}
                    onChange={e => setFormData({ ...formData, vacancies: e.target.value })}
                    placeholder="e.g. 2"
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    This determines how many top candidates will be recommended in the AI ranking
                  </p>
                </div>
                  </SectionPanel>

                  <SectionPanel
                    icon={FileText}
                    title="Description and skills"
                    description="Describe the role clearly and add the skill signals your ranking flow should prioritize."
                  >

                {/* Job Description */}
                <div className="space-y-3">
                  <Label htmlFor="description" className="text-foreground">Job Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the role, responsibilities, and requirements..."
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground min-h-[120px]"
                    required
                  />
                </div>

                {/* Required Skills */}
                <div className="space-y-3">
                  <Label className="text-foreground">Required Skills</Label>
                  <div className="flex gap-3">
                    <Input
                      value={newSkill}
                      onChange={e => setNewSkill(e.target.value)}
                      placeholder="Add a skill..."
                      className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addSkill())}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addSkill}
                      className="border-border text-foreground hover:bg-secondary"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {skills.map(skill => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="bg-secondary text-secondary-foreground pr-1"
                        >
                          {skill}
                          <button
                            type="button"
                            onClick={() => removeSkill(skill)}
                            className="ml-2 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                  </SectionPanel>

                  <SectionPanel
                    icon={SlidersHorizontal}
                    title="Candidate filters"
                    description="Set the minimum academic and eligibility rules that should shape candidate matching."
                  >

                {/* Candidate Filter Criteria */}
                <div className="space-y-5">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Candidate Filter Criteria
                  </p>

                  {/* Min 10th + Min 12th */}
                  <div className="grid grid-cols-2 gap-5">
                    <TooltipWrapper content="Minimum Class 10 percentage required. Candidates below this will be filtered out.">
                      <div className="space-y-3">
                        <Label className="text-foreground">Min 10th % (optional)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          name="min_tenth"
                          value={formData.min_tenth}
                          onChange={e => setFormData({ ...formData, min_tenth: e.target.value })}
                          placeholder="e.g. 60"
                          className="bg-input border-border text-foreground"
                        />
                      </div>
                    </TooltipWrapper>

                    <TooltipWrapper content="Minimum Class 12 percentage required. Candidates below this will be filtered out.">
                      <div className="space-y-3">
                        <Label className="text-foreground">Min 12th % (optional)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          name="min_twelfth"
                          value={formData.min_twelfth}
                          onChange={e => setFormData({ ...formData, min_twelfth: e.target.value })}
                          placeholder="e.g. 60"
                          className="bg-input border-border text-foreground"
                        />
                      </div>
                    </TooltipWrapper>
                  </div>

                  {/* Min CGPA + Equivalent % */}
                  <div className="grid grid-cols-2 gap-5">
                    <TooltipWrapper content="Minimum CGPA required on a 10-point scale. Equivalent percentage will be shown automatically.">
                      <div className="space-y-3">
                        <Label className="text-foreground">Min CGPA (optional)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          name="min_cgpa"
                          value={minCgpa}
                          onChange={e => setMinCgpa(e.target.value)}
                          placeholder="e.g. 7.0"
                          className="bg-input border-border text-foreground"
                        />
                      </div>
                    </TooltipWrapper>

                    <TooltipWrapper content="Auto-calculated from Min CGPA using CGPA × 9.5 formula.">
                      <div className="space-y-3">
                        <Label className="text-foreground">
                          Equivalent %
                          <span className="text-xs text-primary ml-1">(auto)</span>
                        </Label>
                        <Input
                          type="number"
                          value={minCgpa ? (parseFloat(minCgpa) * 9.5).toFixed(1) : ""}
                          readOnly
                          placeholder="Auto-filled"
                          className="bg-input border-border text-muted-foreground cursor-not-allowed"
                        />
                      </div>
                    </TooltipWrapper>
                  </div>

                  {/* Allow Gap + Allow Backlogs */}
                  <div className="grid grid-cols-2 gap-5">
                    <TooltipWrapper content="No = candidates with any gap will be rejected. Yes = candidates with gaps are allowed to apply.">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                        <div>
                          <p className="text-sm font-medium text-foreground">Allow Gap Year</p>
                          <p className="text-xs text-muted-foreground">No = strict, Yes = flexible</p>
                        </div>
                        <Switch checked={allowGap} onCheckedChange={setAllowGap} />
                      </div>
                    </TooltipWrapper>

                    <TooltipWrapper content="No = candidates with any active backlog will be rejected. Yes = candidates with backlogs can apply.">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                        <div>
                          <p className="text-sm font-medium text-foreground">Allow Backlogs</p>
                          <p className="text-xs text-muted-foreground">No = strict, Yes = flexible</p>
                        </div>
                        <Switch checked={allowBacklogs} onCheckedChange={setAllowBacklogs} />
                      </div>
                    </TooltipWrapper>
                  </div>
                </div>

                {/* Remote Work */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground">Remote Work Available</p>
                    <p className="text-sm text-muted-foreground">Allow candidates to work remotely</p>
                  </div>
                  <Switch checked={isRemote} onCheckedChange={setIsRemote} />
                </div>
                  </SectionPanel>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {editingJob ? "Save Changes" : "Post Job"}
                    </>
                  )}
                </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── Right column: Recent Jobs + AI Guide ── */}
          <div className="flex flex-col gap-6">
          <Card className="border-border/90 bg-card/94 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:bg-card/88">
            <CardHeader>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Recent Activity</p>
              <div className="flex items-center gap-2">
                <CardTitle className="text-foreground">Recent Job Postings</CardTitle>
                <TooltipWrapper content="A compact record of your latest job posts so you can jump into details without leaving this screen." className="w-auto">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-card/80 text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </span>
                </TooltipWrapper>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[480px] overflow-y-auto">
                {recentJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No jobs posted yet.
                  </p>
                ) : recentJobs.map((job) => {
                  const jobVisual = getJobVisual(job)
                  const JobTypeIcon = jobVisual.icon

                  return (
                    <div
                      key={job.id}
                      className={cn(
                        "rounded-[1.15rem] border border-border/78 bg-card/96 p-3 transition-all",
                        canOpenRankingForJob(job)
                          ? "cursor-pointer hover:border-primary/20 hover:bg-card"
                          : "cursor-default",
                      )}
                      onClick={() => {
                        if (!canOpenRankingForJob(job)) return
                        handleOpenRanking(job)
                      }}
                      onKeyDown={(event) => {
                        if (!canOpenRankingForJob(job)) return
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          handleOpenRanking(job)
                        }
                      }}
                      role={canOpenRankingForJob(job) ? "button" : undefined}
                      tabIndex={canOpenRankingForJob(job) ? 0 : undefined}
                      aria-label={canOpenRankingForJob(job) ? `Open ranking for ${job.title}` : undefined}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${jobVisual.surfaceClassName}`}>
                          {unseenApplicationJobIds.has(job.id) && (
                            <span className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                          )}
                          <JobTypeIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground text-[13.5px] truncate">{job.title}</p>
                            <StatusBadge status={job.status as JobStatus} />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <MetaPill icon={Building2} value={job.department} />
                            <MetaPill icon={JobTypeIcon} value={job.employment_type} iconClassName={jobVisual.iconClassName} />
                            <MetaPill icon={MapPin} value={job.location} />
                            <MetaPill icon={Clock3} value={new Date(job.created_at).toLocaleDateString()} className="text-muted-foreground" />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {job.required_skills?.slice(0, 2).map((skill) => (
                              <Badge key={skill} variant="secondary" className="border border-border/65 bg-background/82 px-2.5 py-1 text-[10.5px] font-semibold text-foreground/84">
                                {skill}
                              </Badge>
                            ))}
                            {(job.required_skills?.length || 0) > 2 && (
                              <Badge variant="secondary" className="border border-border/65 bg-background/82 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
                                +{job.required_skills.length - 2}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center rounded-[1rem] border border-border/70 bg-secondary/30 p-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setViewJob(job)
                            }}
                            className="h-8 rounded-xl border-border bg-background/84 text-muted-foreground hover:text-foreground text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── AI Scoring Guide ── */}
          <Card className="border-border/90 bg-card/94 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:bg-card/88">
            <CardHeader className="pb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">How It Works</p>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-foreground text-base">AI Scoring Guide</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Triplet scores each applicant automatically against the criteria you set. Here's what drives the score:
              </p>
              <div className="space-y-2.5">
                {[
                  {
                    icon: GraduationCap,
                    title: "Academic Eligibility",
                    desc: "10th, 12th, and CGPA thresholds act as hard filters — candidates below them are excluded before ranking begins.",
                    color: "text-blue-400",
                    bg: "bg-blue-500/10",
                  },
                  {
                    icon: Layers3,
                    title: "Required Skills Match",
                    desc: "Each skill you list is matched against the candidate's resume using semantic similarity, not just keyword search.",
                    color: "text-violet-400",
                    bg: "bg-violet-500/10",
                  },
                  {
                    icon: Sparkles,
                    title: "AI Bonus Points",
                    desc: "Bonus criteria (skill in project, elite internship, project level, internship duration) boost the final score for standout candidates.",
                    color: "text-primary",
                    bg: "bg-primary/10",
                  },
                  {
                    icon: Clock3,
                    title: "Passout Year Range",
                    desc: "Restricts applicants by graduation year. Leave both blank to accept candidates from any batch.",
                    color: "text-amber-400",
                    bg: "bg-amber-500/10",
                  },
                  {
                    icon: Users2,
                    title: "Gap & Backlog Rules",
                    desc: "These are hard constraints. A candidate with a gap or active backlogs who falls outside your limits is automatically excluded.",
                    color: "text-rose-400",
                    bg: "bg-rose-500/10",
                  },
                ].map(({ icon: Icon, title, desc, color, bg }) => (
                  <div key={title} className="flex gap-3 rounded-xl border border-border/50 bg-secondary/30 p-3 dark:bg-secondary/15">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          </div>{/* end right column */}
        </div>
      )}

      {/* ── Job list tabs ── */}
      {activeTab !== "post" && (
        <div ref={jobListSectionRef} className="scroll-mt-24">
          <JobListTab
          tab={activeTab}
          jobs={jobs}
          search={jobSearch}
          filterMode={filterMode}
          total={jobTotal}
          selectionMode={selectionMode}
          selectedJobIds={selectedJobIds}
          onOpenRanking={handleOpenRanking}
          onStatusChange={handleStatusChange}
          onEdit={handleEditJob}
          onRemove={handleRemove}
          onView={setViewJob}
          onPostJob={() => handleTabChange("post", "form")}
          onToggleSelectionMode={handleToggleSelectionMode}
          onToggleSelectJob={handleToggleSelectJob}
          onSelectVisibleJobs={handleSelectVisibleJobs}
          onClearSelection={handleClearSelection}
          onBulkPause={(jobIds) => requestStatusChange(jobIds, "paused")}
          onBulkResume={(jobIds) => requestStatusChange(jobIds, "active")}
          onBulkRemove={requestRemove}
          onSearchChange={setJobSearch}
          onFilterModeChange={setFilterMode}
          onLoadMore={handleLoadMore}
          updating={updating}
          bulkUpdating={bulkUpdating}
          unseenApplicationJobIds={unseenApplicationJobIds}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMoreJobs}
          loadMoreRef={loadMoreRef}
        />
        </div>
      )}

      {/* Job detail dialog */}
      {viewJob && <JobDetailDialog job={viewJob} onClose={handleCloseViewJob} />}

      <AlertDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open && !bulkUpdating && updating === null) {
            setPendingAction(null)
          }
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {getPendingActionCopy(pendingAction).title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {getPendingActionCopy(pendingAction).description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setPendingAction(null)}
              className="border-border text-foreground"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={() => void handleConfirmPendingAction()}
              disabled={bulkUpdating || updating !== null}
              className={getPendingActionCopy(pendingAction).buttonClassName}
            >
              {bulkUpdating || updating !== null
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                : getPendingActionCopy(pendingAction).cta}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
