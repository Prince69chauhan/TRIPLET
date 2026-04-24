"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { jobService } from "@/lib/jobService"
import { markAvailableJobSeen, subscribeToIndicatorChanges, syncAvailableJobsIndicator } from "@/lib/activity-indicators"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSwipeTabNavigation } from "@/hooks/use-swipe-tab-navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Bookmark, Briefcase, Loader2, Search, Send, SlidersHorizontal } from "lucide-react"
import { JobCard } from "./job-card"
import { JobViewDialog } from "./job-view-dialog"
import type { AppliedJob, Job, PaginatedResult, Tab, TabListState } from "./types"
export function JobsSection() {
  const router = useRouter()
  const isMobile = useIsMobile()
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
  const [filtersOpen, setFiltersOpen] = useState(false)
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
    { id: "available" as Tab, label: "Available Jobs", shortLabel: "Open", icon: Briefcase, count: lists.available.total || lists.available.items.length },
    { id: "applied" as Tab, label: "Applications Sent", shortLabel: "Applied", icon: Send, count: lists.applied.total || lists.applied.items.length },
    { id: "saved" as Tab, label: "Saved Jobs", shortLabel: "Saved", icon: Bookmark, count: lists.saved.total || lists.saved.items.length },
  ] as const

  const swipeHandlers = useSwipeTabNavigation<Tab>({
    tabs: tabs.map((tab) => tab.id),
    activeTab,
    onChange: handleTabChange,
    enabled: isMobile,
  })

  const currentJobs = lists[activeTab].items
  const availableNewThisWeek = useMemo(
    () => lists.available.items.filter((job) => Date.now() - new Date(job.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length,
    [lists.available.items],
  )
  const shortlistedCount = useMemo(
    () => lists.applied.items.filter((job) => job.status?.toLowerCase() === "shortlisted").length,
    [lists.applied.items],
  )
  const underReviewCount = useMemo(
    () => lists.applied.items.filter((job) => {
      const status = job.status?.toLowerCase()
      return status === "processing" || status === "pending" || status === "scored"
    }).length,
    [lists.applied.items],
  )
  const desktopOverviewCards = [
    {
      label: "Available Jobs",
      value: lists.available.total || lists.available.items.length,
      hint: `+${availableNewThisWeek} new this week`,
    },
    {
      label: "Applied",
      value: lists.applied.total || lists.applied.items.length,
      hint: `${underReviewCount} under review`,
    },
    {
      label: "Shortlisted",
      value: shortlistedCount,
      hint: shortlistedCount > 0 ? "Congratulations!" : "Keep going",
    },
  ] as const
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
    <div className="space-y-2.5 sm:space-y-3" {...swipeHandlers} style={isMobile ? { touchAction: "pan-y" } : undefined}>
      {isMobile ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  aria-label={tab.label}
                  className={`rounded-2xl border px-2.5 py-2.5 text-center transition-all duration-200 ${
                    isActive
                      ? "border-primary/35 bg-primary/10 text-primary shadow-[0_4px_14px_color-mix(in_oklch,var(--primary)_10%,transparent)]"
                      : "border-border/60 bg-card text-muted-foreground"
                  }`}
                >
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/60">
                    <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-1">
                    {tab.id === "available" && unseenAvailableJobIds.size > 0 && (
                      <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                    )}
                    <span className={`text-[18px] font-bold leading-none tabular-nums ${isActive ? "text-primary" : "text-foreground"}`}>
                      {tab.count}
                    </span>
                  </div>
                  <p className={`mt-1 text-[10.5px] font-semibold ${isActive ? "text-primary/90" : "text-muted-foreground"}`}>
                    {tab.shortLabel}
                  </p>
                </button>
              )
            })}
          </div>

          <Card className="border-border/60 bg-card py-0">
            <CardContent className="p-2.5 sm:p-3">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search jobs by title, description, or skills..."
                    className="h-8 border-border/60 bg-input pl-9 text-[12.5px] font-medium text-foreground placeholder:text-muted-foreground/60"
                  />
                </div>

                <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="md:hidden">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full border-border/60 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filters
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <Input
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      placeholder="Location"
                      className="h-8 w-full border-border/60 bg-input text-[12.5px] font-medium text-foreground"
                    />
                    {activeTab !== "available" && (
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-8 w-full border-border/60 bg-input text-[12.5px] font-medium text-foreground">
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
                      <SelectTrigger className="h-8 w-full border-border/60 bg-input text-[12.5px] font-medium text-foreground">
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
                      <SelectTrigger className="h-8 w-full border-border/60 bg-input text-[12.5px] font-medium text-foreground">
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
                      className="h-8 w-full border-border/60 bg-input text-[12.5px] font-medium text-foreground"
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
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

          <Card className="border-border/70 bg-card/96 py-0 shadow-[0_10px_24px_rgba(15,23,42,0.05)] dark:bg-card/90">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleTabChange(tab.id)}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold transition-all ${
                          isActive
                            ? "border-primary/30 bg-primary text-primary-foreground shadow-[0_6px_16px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                            : "border-border/70 bg-secondary/60 text-muted-foreground hover:border-primary/20 hover:text-foreground"
                        }`}
                      >
                        <span className="relative flex h-7 w-7 items-center justify-center rounded-xl bg-black/10 text-current dark:bg-white/10">
                          {tab.id === "available" && unseenAvailableJobIds.size > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                          )}
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span>{tab.id === "available" ? "All Jobs" : tab.shortLabel}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                          isActive ? "bg-black/10 text-primary-foreground dark:bg-white/12" : "bg-background/90 text-foreground"
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1 sm:w-[320px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search jobs..."
                      className="h-11 border-border/60 bg-input pl-10 text-sm font-medium text-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFiltersOpen((current) => !current)}
                    className="h-11 rounded-xl border-border/80 bg-card/98 px-4 text-sm font-semibold text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filter
                  </Button>
                </div>
              </div>

              {filtersOpen && (
                <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border/60 pt-4 sm:grid-cols-2 xl:grid-cols-5">
                  <Input
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    placeholder="Location"
                    className="h-10 border-border/60 bg-input text-sm font-medium text-foreground"
                  />
                  {activeTab !== "available" ? (
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-10 border-border/60 bg-input text-sm font-medium text-foreground">
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
                  ) : (
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="h-10 border-border/60 bg-input text-sm font-medium text-foreground">
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
                  )}
                  {activeTab !== "available" && (
                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                      <SelectTrigger className="h-10 border-border/60 bg-input text-sm font-medium text-foreground">
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
                  )}
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-10 border-border/60 bg-input text-sm font-medium text-foreground">
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
                    className="h-10 border-border/60 bg-input text-sm font-medium text-foreground"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {applyError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {applyError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : currentJobs.length === 0 ? (
        <Card className="border-border/60 bg-card py-0">
          <CardContent className="space-y-2.5 py-12 text-center">
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
        <div className="space-y-2">
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
      <JobViewDialog
        activeTab={activeTab}
        applying={applying}
        isApplied={!!viewJob && appliedIds.has(viewJob.id)}
        job={viewJob}
        onApply={handleApply}
        onClose={() => setViewJob(null)}
      />
    </div>
  )
}
