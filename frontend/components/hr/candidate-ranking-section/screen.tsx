"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import api from "@/lib/api"
import { jobService } from "@/lib/jobService"
import { ChatWindow } from "@/components/chat/chat-window"
import { AnalyticsSectionSkeleton } from "@/components/dashboard/section-skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useIsMobile } from "@/hooks/use-mobile"
import { markJobApplicationsSeen, subscribeToIndicatorChanges, syncJobApplicationIndicators } from "@/lib/activity-indicators"
import { getJobVisual } from "@/lib/job-visuals"
import { Briefcase, ChevronDown, ChevronUp, Download, FileText, Loader2, Search, SlidersHorizontal, Star, Users } from "lucide-react"
import {
  CandidateCard,
  DEFAULT_WEIGHTS,
  FilteredJobAnalytics,
  JobAnalytics,
  MobileAccordionPanel,
  OverallAnalytics,
  WeightTuner,
  computeAdjustedScore,
  exportCSV,
  exportPDF,
  getJobTimestamp,
  getPausedDays,
  resolveStatus,
  weightsAreDefault,
} from "./shared"
import type { Job, JobCounts, JobStat, RankedCandidate, ScoringWeights } from "./shared"

const AnalyticsDashboard = dynamic(
  () => import("@/components/hr/analytics-dashboard").then((module) => module.AnalyticsDashboard),
  {
    ssr: false,
    loading: () => <AnalyticsSectionSkeleton />,
  },
)

const ShortlistDialog = dynamic(
  () => import("@/components/hr/shortlist-dialog").then((module) => module.ShortlistDialog),
  { ssr: false },
)
export function CandidateRankingSection() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()
  const [jobs, setJobs] = useState<Job[]>([])
  const [counts, setCounts] = useState<JobCounts | null>(null)
  const [jobStats, setJobStats] = useState<JobStat[]>([])
  const [jobSearch, setJobSearch] = useState("")
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<RankedCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPassed, setFilterPassed] = useState("all")
  const [candSearch, setCandSearch] = useState("")
  const [shortlistOpen, setShortlistOpen] = useState(false)
  const [shortlistTarget, setShortlistTarget] = useState<RankedCandidate | null>(null)
  const [chatOpen, setChatOpen]       = useState(false)
  const [chatConvId, setChatConvId]   = useState<string | null>(null)
  const [chatJobTitle, setChatJobTitle] = useState("")
  const [chatCandName, setChatCandName] = useState("")
  const [chatError, setChatError]     = useState<string | null>(null)
  const [candidatePage, setCandidatePage] = useState(1)
  const [totalCandidates, setTotalCandidates] = useState(0)
  const [hasMoreCandidates, setHasMoreCandidates] = useState(false)
  const [unseenApplicationJobIds, setUnseenApplicationJobIds] = useState<Set<string>>(new Set())
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [weightsOpen, setWeightsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [jobFiltersOpen, setJobFiltersOpen] = useState(false)
  const [jobStatusFilter, setJobStatusFilter] = useState<"all" | "active" | "inactive" | "paused">("all")
  const [jobTypeFilter, setJobTypeFilter] = useState("all")
  const [jobLocationFilter, setJobLocationFilter] = useState("all")
  const [jobSalaryFilter, setJobSalaryFilter] = useState("")
  const [jobApplicationFilter, setJobApplicationFilter] = useState<"all" | "with_applications" | "none_applied">("all")
  const [jobSortMode, setJobSortMode] = useState<"latest" | "most_applied" | "least_applied" | "title_asc" | "title_desc" | "paused_longest">("latest")
  const selectedJobIdFromUrl = searchParams.get("rankingJob")
  const debouncedJobSearch = useDebouncedValue(jobSearch, 250)
  const debouncedJobSalaryFilter = useDebouncedValue(jobSalaryFilter, 250)
  const debouncedCandidateSearch = useDebouncedValue(candSearch, 250)
  const rankingPageSize = 25
  const candidateFilterCount =
    (filterStatus !== "all" ? 1 : 0) +
    (filterPassed !== "all" ? 1 : 0) +
    (sortOrder !== "desc" ? 1 : 0)
  const jobFilterCount =
    (jobStatusFilter !== "all" ? 1 : 0) +
    (jobTypeFilter !== "all" ? 1 : 0) +
    (jobLocationFilter !== "all" ? 1 : 0) +
    (jobApplicationFilter !== "all" ? 1 : 0) +
    (debouncedJobSalaryFilter.trim() ? 1 : 0) +
    (jobSortMode !== "latest" ? 1 : 0)

  useEffect(() => {
    const loadJobs = async () => {
      const [myJobsResult, postedResult] = await Promise.allSettled([
        jobService.getMyJobs(),
        jobService.getJobsByStatus("posted"),
      ])

      const myJobs = myJobsResult.status === "fulfilled" && Array.isArray(myJobsResult.value)
        ? myJobsResult.value as Job[]
        : []
      const postedJobs = postedResult.status === "fulfilled" && Array.isArray(postedResult.value)
        ? postedResult.value as Job[]
        : []

      const merged = [...myJobs, ...postedJobs]
      const unique = merged.filter((job, index, arr) => arr.findIndex(other => other.id === job.id) === index)
      setJobs(unique)
    }

    loadJobs().catch(() => setJobs([]))
  }, [])

  useEffect(() => {
    jobService.getJobCounts()
      .then(data => setCounts((data as JobCounts) ?? null))
      .catch(() => setCounts(null))
  }, [])

  useEffect(() => {
    let active = true

    const loadIndicators = async () => {
      try {
        const stats = await jobService.getJobAnalytics({ force: true }) as JobStat[]
        if (!active) return
        setJobStats(Array.isArray(stats) ? stats : [])
        const unseenIds = syncJobApplicationIndicators(
          "hr",
          Array.isArray(stats)
            ? stats.map((job) => ({ jobId: job.job_id, totalApplications: job.total_applications ?? 0 }))
            : [],
        )
        setUnseenApplicationJobIds(new Set(unseenIds))
      } catch {
        if (active) {
          setJobStats([])
          setUnseenApplicationJobIds(new Set())
        }
      }
    }

    void loadIndicators()
    const interval = window.setInterval(() => {
      void loadIndicators()
    }, 5_000)
    const unsubscribe = subscribeToIndicatorChanges(() => {
      void loadIndicators()
    })

    return () => {
      active = false
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!selectedJobIdFromUrl || jobs.length === 0) return
    const match = jobs.find((job) => job.id === selectedJobIdFromUrl)
    if (match && selectedJob?.id !== match.id) {
      void selectJob(match, false)
    }
  }, [jobs, selectedJobIdFromUrl])

  const jobStatsById = useMemo(() => new Map(jobStats.map(stat => [stat.job_id, stat])), [jobStats])
  const availableJobTypes = useMemo(() => (
    [...new Set(
      jobs
        .map(job => job.employment_type?.trim())
        .filter((value): value is string => Boolean(value)),
    )].sort((a, b) => a.localeCompare(b))
  ), [jobs])
  const availableLocations = useMemo(() => (
    [...new Set(
      jobs
        .map(job => job.location?.trim())
        .filter((value): value is string => Boolean(value)),
    )].sort((a, b) => a.localeCompare(b))
  ), [jobs])

  const filteredJobs = useMemo(() => {
    const query = debouncedJobSearch.trim().toLowerCase()
    const salaryQuery = debouncedJobSalaryFilter.trim().toLowerCase()

    const nextJobs = jobs.filter(job => {
      const status = resolveStatus(job)
      const applications = jobStatsById.get(job.id)?.total_applications ?? 0
      const matchesQuery = !query || job.title.toLowerCase().includes(query)
      const matchesStatus = jobStatusFilter === "all"
        ? true
        : jobStatusFilter === "inactive"
          ? status === "removed" || status === "completed"
          : status === jobStatusFilter
      const matchesType = jobTypeFilter === "all"
        ? true
        : (job.employment_type?.trim().toLowerCase() ?? "") === jobTypeFilter.toLowerCase()
      const matchesLocation = jobLocationFilter === "all"
        ? true
        : (job.location?.trim().toLowerCase() ?? "") === jobLocationFilter.toLowerCase()
      const matchesSalary = !salaryQuery || (job.salary?.toLowerCase().includes(salaryQuery) ?? false)
      const matchesApplications = jobApplicationFilter === "all"
        ? true
        : jobApplicationFilter === "none_applied"
          ? applications === 0
          : applications > 0

      return matchesQuery && matchesStatus && matchesType && matchesLocation && matchesSalary && matchesApplications
    })

    return [...nextJobs].sort((a, b) => {
      const applicationsA = jobStatsById.get(a.id)?.total_applications ?? 0
      const applicationsB = jobStatsById.get(b.id)?.total_applications ?? 0

      if (jobSortMode === "most_applied") {
        return applicationsB - applicationsA || b.title.localeCompare(a.title)
      }
      if (jobSortMode === "least_applied") {
        return applicationsA - applicationsB || a.title.localeCompare(b.title)
      }
      if (jobSortMode === "title_asc") {
        return a.title.localeCompare(b.title)
      }
      if (jobSortMode === "title_desc") {
        return b.title.localeCompare(a.title)
      }
      if (jobSortMode === "paused_longest") {
        return getPausedDays(b) - getPausedDays(a) || applicationsB - applicationsA
      }
      return getJobTimestamp(b) - getJobTimestamp(a)
    })
  }, [debouncedJobSalaryFilter, debouncedJobSearch, jobApplicationFilter, jobLocationFilter, jobSortMode, jobStatsById, jobStatusFilter, jobTypeFilter, jobs])

  const visibleJobAnalytics = useMemo(() => {
    const visibleApplicants = filteredJobs.reduce((total, job) => total + (jobStatsById.get(job.id)?.total_applications ?? 0), 0)
    const jobsWithNoApplicants = filteredJobs.filter(job => (jobStatsById.get(job.id)?.total_applications ?? 0) === 0).length
    const mostAppliedJob = [...filteredJobs]
      .filter(job => (jobStatsById.get(job.id)?.total_applications ?? 0) > 0)
      .sort((a, b) => (jobStatsById.get(b.id)?.total_applications ?? 0) - (jobStatsById.get(a.id)?.total_applications ?? 0))[0] ?? null
    const longestPausedJob = [...filteredJobs]
      .filter(job => resolveStatus(job) === "paused")
      .sort((a, b) => getPausedDays(b) - getPausedDays(a))[0] ?? null

    return {
      visibleApplicants,
      jobsWithNoApplicants,
      mostAppliedJob,
      longestPausedJob,
    }
  }, [filteredJobs, jobStatsById])
  const leaderboardQuery = useMemo(() => ({
    search: debouncedCandidateSearch.trim() || undefined,
    status: filterStatus,
    passed: filterPassed,
    sort_by: "final_score",
    sort_order: sortOrder,
    page_size: rankingPageSize,
  }), [debouncedCandidateSearch, filterPassed, filterStatus, sortOrder])
  const leaderboardQueryKey = useMemo(() => JSON.stringify(leaderboardQuery), [leaderboardQuery])

  const loadLeaderboard = async (job: Job, page = 1, append = false, force = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setCandidates([])
    }

    try {
      const data = await jobService.getRankedCandidates(job.id, {
        ...leaderboardQuery,
        page,
        force,
      }) as {
        total?: number
        page?: number
        has_more?: boolean
        leaderboard?: RankedCandidate[]
      }

      const nextCandidates = Array.isArray(data.leaderboard) ? data.leaderboard : []
      setCandidates((current) => {
        if (!append) return nextCandidates
        return [
          ...current,
          ...nextCandidates.filter((candidate) => !current.some((existing) => existing.application_id === candidate.application_id)),
        ]
      })
      setTotalCandidates(typeof data.total === "number" ? data.total : nextCandidates.length)
      setCandidatePage(typeof data.page === "number" ? data.page : page)
      setHasMoreCandidates(Boolean(data.has_more))
    } catch {
      if (!append) {
        setCandidates([])
        setTotalCandidates(0)
        setCandidatePage(1)
        setHasMoreCandidates(false)
      }
    } finally {
      if (append) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }

  const selectJob = async (job: Job, syncUrl = true) => {
    markJobApplicationsSeen("hr", job.id)
    setUnseenApplicationJobIds((current) => {
      const next = new Set(current)
      next.delete(job.id)
      return next
    })
    setSelectedJob(job)
    if (syncUrl) {
      const params = new URLSearchParams(searchParams.toString())
      params.set("rankingJob", job.id)
      router.replace(`${pathname}?${params.toString()}`)
    }
    setCandidatePage(1)
    await loadLeaderboard(job, 1)
  }

  const refreshSelectedJob = async () => {
    if (!selectedJob) return
    await loadLeaderboard(selectedJob, 1, false, true)
  }

  const handleBackToOverview = () => {
    setSelectedJob(null)
    setCandidates([])
    setCandidatePage(1)
    setTotalCandidates(0)
    setHasMoreCandidates(false)
    const params = new URLSearchParams(searchParams.toString())
    params.delete("rankingJob")
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  useEffect(() => {
    if (!selectedJob) return
    void loadLeaderboard(selectedJob, 1)
  }, [leaderboardQueryKey, selectedJob?.id])

  const handleLoadMore = useCallback(() => {
    if (!selectedJob || !hasMoreCandidates || loading || loadingMore) return
    void loadLeaderboard(selectedJob, candidatePage + 1, true)
  }, [candidatePage, hasMoreCandidates, loading, loadingMore, selectedJob])

  const loadMoreRef = useInfiniteScroll({
    enabled: Boolean(selectedJob && hasMoreCandidates && !loading && !loadingMore),
    onLoadMore: handleLoadMore,
  })
  const handleShortlistCandidate = useCallback((candidate: RankedCandidate | null) => {
    setShortlistTarget(candidate)
    setShortlistOpen(true)
  }, [])
  const handleCloseShortlist = useCallback(() => {
    setShortlistOpen(false)
  }, [])

  const handleWeightChange = useCallback((key: keyof ScoringWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleWeightReset = useCallback(() => {
    setWeights(DEFAULT_WEIGHTS)
  }, [])

  const sortedCandidates = useMemo(() => {
    if (weightsAreDefault(weights)) return candidates
    return [...candidates].sort((a, b) => computeAdjustedScore(b, weights) - computeAdjustedScore(a, weights))
  }, [candidates, weights])

  const handleMessage = useCallback(async (candidate: RankedCandidate) => {
    setChatError(null)
    try {
      const res = await api.post<{ conversation_id: string }>("/api/messages/conversations", {
        application_id: candidate.application_id,
      })
      setChatConvId(res.conversation_id)
      setChatJobTitle(selectedJob?.title ?? "")
      setChatCandName(candidate.full_name)
      setChatOpen(true)
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : "Failed to open conversation"
      setChatError(msg)
    }
  }, [selectedJob])

  if (!selectedJob) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {isMobile ? (
          <MobileAccordionPanel value="advanced-analytics" title="Advanced Analytics">
            <AnalyticsDashboard />
          </MobileAccordionPanel>
        ) : (
          <AnalyticsDashboard />
        )}
        <OverallAnalytics jobs={jobs} counts={counts} />
        <Card className="border-border/60 bg-card">
          <CardContent className="space-y-3 p-3.5 sm:space-y-4 sm:p-5">
            <Collapsible open={jobFiltersOpen} onOpenChange={setJobFiltersOpen}>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={jobSearch} onChange={e => setJobSearch(e.target.value)} placeholder="Search job by title..." className="h-10 border-border/60 bg-input pl-9 text-[13px] text-foreground sm:text-[13.5px]" />
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="h-10 justify-between border-border/60 text-foreground sm:min-w-[172px]">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      Filter
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {jobFilterCount > 0 ? `${jobFilterCount} active` : "Default"}
                    </span>
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="pt-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  <Select value={jobStatusFilter} onValueChange={(value) => setJobStatusFilter(value as "all" | "active" | "inactive" | "paused")}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                      <SelectValue placeholder="Job status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Jobs</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                      <SelectValue placeholder="Job type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Job Types</SelectItem>
                      {availableJobTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={jobLocationFilter} onValueChange={setJobLocationFilter}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {availableLocations.map(location => (
                        <SelectItem key={location} value={location}>{location}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={jobSalaryFilter}
                    onChange={e => setJobSalaryFilter(e.target.value)}
                    placeholder="Salary contains..."
                    className="h-9 border-border/60 bg-input text-[13px] text-foreground"
                  />
                  <Select value={jobApplicationFilter} onValueChange={(value) => setJobApplicationFilter(value as "all" | "with_applications" | "none_applied")}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                      <SelectValue placeholder="Applicant volume" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Application States</SelectItem>
                      <SelectItem value="with_applications">With Applicants</SelectItem>
                      <SelectItem value="none_applied">None Applied</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={jobSortMode} onValueChange={(value) => setJobSortMode(value as "latest" | "most_applied" | "least_applied" | "title_asc" | "title_desc" | "paused_longest")}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                      <SelectValue placeholder="Sort jobs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">Latest First</SelectItem>
                      <SelectItem value="most_applied">Most Applied</SelectItem>
                      <SelectItem value="least_applied">Least Applied</SelectItem>
                      <SelectItem value="title_asc">Title A-Z</SelectItem>
                      <SelectItem value="title_desc">Title Z-A</SelectItem>
                      <SelectItem value="paused_longest">Paused Longest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Visible jobs</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-foreground">{filteredJobs.length}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Visible applicants</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-foreground">{visibleJobAnalytics.visibleApplicants}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">No applicants</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-foreground">{visibleJobAnalytics.jobsWithNoApplicants}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50 bg-secondary/20">
                <CardContent className="p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Priority signal</p>
                  <p className="mt-1 truncate text-[13px] font-semibold text-foreground">
                    {visibleJobAnalytics.mostAppliedJob
                      ? `${visibleJobAnalytics.mostAppliedJob.title} · ${jobStatsById.get(visibleJobAnalytics.mostAppliedJob.id)?.total_applications ?? 0} apps`
                      : visibleJobAnalytics.longestPausedJob
                        ? `${visibleJobAnalytics.longestPausedJob.title} · paused ${getPausedDays(visibleJobAnalytics.longestPausedJob)}d`
                        : "No standout yet"}
                  </p>
                </CardContent>
              </Card>
            </div>
            <FilteredJobAnalytics
              jobs={filteredJobs}
              jobStatsById={jobStatsById}
              sortMode={jobSortMode}
              salaryQuery={debouncedJobSalaryFilter.trim()}
            />
            {filteredJobs.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/60">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-[13.5px] font-semibold text-foreground">No jobs found</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">Try adjusting your search or filters.</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {filteredJobs.map((job) => {
                  const jobVisual = getJobVisual(job)
                  const JobTypeIcon = jobVisual.icon

                  return (
                    <button
                      key={job.id}
                      onClick={() => selectJob(job)}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] sm:rounded-xl sm:p-4 dark:bg-secondary/20 dark:hover:bg-secondary/40 dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset transition-colors sm:h-10 sm:w-10 sm:rounded-[11px] ${jobVisual.surfaceClassName}`}>
                          <JobTypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {unseenApplicationJobIds.has(job.id) && <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />}
                            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground sm:text-[13.5px]">{job.title}</p>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-[11.5px]">
                            {(jobStatsById.get(job.id)?.total_applications ?? 0)} applicants
                            {job.required_skills?.length ? ` · ${job.required_skills.length} target skills` : ""}
                            {resolveStatus(job) === "paused" && getPausedDays(job) > 0 ? ` · paused ${getPausedDays(job)}d` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge className={`shrink-0 border-0 text-[10px] font-semibold uppercase tracking-[0.04em] sm:text-[10.5px] ${resolveStatus(job) === "active" ? "bg-green-500/10 text-green-500" : resolveStatus(job) === "paused" ? "bg-yellow-500/10 text-yellow-500" : "bg-secondary text-muted-foreground"}`}>
                        {resolveStatus(job) === "removed" || resolveStatus(job) === "completed"
                          ? "inactive"
                          : resolveStatus(job) === "unknown"
                            ? "active"
                            : resolveStatus(job)}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <FloatingBackButton
        onClick={handleBackToOverview}
        className="top-20 left-4 sm:left-6 sm:top-24 lg:left-[18rem]"
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-12 sm:gap-3 sm:pt-0">
        <div className="sm:pl-24">
          <h2 className="text-[18px] font-bold tracking-[-0.02em] text-foreground">{selectedJob.title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground/80 tabular-nums">{totalCandidates}</span> applicants
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => exportCSV(candidates, selectedJob.title)} className="h-9 border-border/60 text-[12px] font-medium text-muted-foreground hover:text-foreground"><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(candidates, selectedJob.title)} className="h-9 border-border/60 text-[12px] font-medium text-muted-foreground hover:text-foreground"><FileText className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeightsOpen(o => !o)}
            className={`h-9 border-border/60 text-[12px] font-medium ${weightsOpen || !weightsAreDefault(weights) ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Weights
            {!weightsAreDefault(weights) && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
          </Button>
          <Button size="sm" onClick={() => handleShortlistCandidate(null)} className="h-9 bg-primary text-[12px] font-semibold text-primary-foreground shadow-[0_2px_10px_color-mix(in_oklch,var(--primary)_26%,transparent)]"><Star className="mr-1.5 h-3.5 w-3.5" /> Shortlist</Button>
        </div>
      </div>
      {!loading && candidates.length > 0 && (
        <JobAnalytics
          candidates={candidates}
          totalCandidates={totalCandidates}
          jobStat={jobStatsById.get(selectedJob.id) ?? null}
        />
      )}
      {weightsOpen && (
        <WeightTuner weights={weights} onChange={handleWeightChange} onReset={handleWeightReset} />
      )}
      <Card className="border-border/60 bg-card">
        <CardContent className="p-3.5 sm:p-4">
          <div className="space-y-2.5 sm:space-y-3">
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={candSearch} onChange={e => setCandSearch(e.target.value)} placeholder="Search candidates..." className="h-9 border-border/60 bg-input pl-9 text-[13px] text-foreground" />
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="h-9 justify-between border-border/60 text-foreground sm:min-w-[180px]">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      Filter
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {candidateFilterCount > 0 ? `${candidateFilterCount} active` : "Default"}
                    </span>
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2.5 pt-2">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="scored">Scored</SelectItem><SelectItem value="shortlisted">Shortlisted</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
                  </Select>
                  <Select value={filterPassed} onValueChange={setFilterPassed}>
                    <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground"><SelectValue placeholder="Filter" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Candidates</SelectItem><SelectItem value="passed">Passed Filter</SelectItem><SelectItem value="failed">Failed Filter</SelectItem></SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setSortOrder(cur => cur === "desc" ? "asc" : "desc")} className="h-9 w-full border-border/60 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                    {sortOrder === "desc" ? <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> : <ChevronUp className="mr-1.5 h-3.5 w-3.5" />}
                    {sortOrder === "desc" ? "Highest First" : "Lowest First"}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <p className="text-[11.5px] text-muted-foreground sm:text-right">
              Showing <span className="font-semibold text-foreground/80 tabular-nums">{candidates.length}</span> of <span className="tabular-nums">{totalCandidates}</span>
            </p>
          </div>
        </CardContent>
      </Card>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : candidates.length === 0 ? (
        <Card className="border-border/60 bg-card">
          <CardContent className="space-y-2.5 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-semibold text-foreground">No candidates found</p>
            <p className="text-[12.5px] text-muted-foreground">Try adjusting your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {sortedCandidates.map((candidate, index) => (
            <CandidateCard key={candidate.application_id} candidate={candidate} index={index} recommended={index < Math.max(selectedJob.vacancies ?? 3, 3)} job={selectedJob} onShortlist={handleShortlistCandidate} onMessage={handleMessage} adjustedScore={computeAdjustedScore(candidate, weights)} />
          ))}
          <div ref={loadMoreRef} className="h-2 w-full" />
          {loadingMore && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
        </div>
      )}
      {shortlistOpen && (
        <ShortlistDialog
          open={shortlistOpen}
          onClose={handleCloseShortlist}
          candidates={candidates}
          jobId={selectedJob.id}
          jobTitle={selectedJob.title}
          preselected={shortlistTarget}
          onCompleted={refreshSelectedJob}
        />
      )}
      {chatError && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
          {chatError}
        </p>
      )}
      {chatOpen && chatConvId && (
        <Dialog open={chatOpen} onOpenChange={setChatOpen}>
          <DialogContent showCloseButton={false} className="bg-card border-border p-0 max-w-lg h-[600px] flex flex-col overflow-hidden">
            <ChatWindow
              conversationId={chatConvId}
              jobTitle={chatJobTitle}
              otherPartyName={chatCandName}
              currentRole="hr"
              onClose={() => setChatOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
