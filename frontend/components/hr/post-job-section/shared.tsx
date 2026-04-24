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

export type JobStatus = "active" | "paused" | "removed" | "completed"
export type TabType   = "post" | "posted" | "active" | "inactive" | "past"

const WINDOWED_JOB_CARD_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "160px",
} as const

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

export interface Job {
  id              : string
  title           : string
  description     : string
  department?     : string | null
  employment_type?: string | null
  location?       : string | null
  salary?         : string | null
  vacancies?      : number | null
  required_skills : string[]
  min_tenth_percentage?: number | null
  min_twelfth_percentage?: number | null
  min_cgpa        : number | null
  min_passout_year: number | null
  max_passout_year: number | null
  allow_gap       : boolean
  max_gap_months? : number | null
  allow_backlogs  : boolean
  max_active_backlogs?: number | null
  bonus_skill_in_project?: number | null
  bonus_elite_internship?: number | null
  bonus_project_level?: number | null
  bonus_internship_duration?: number | null
  status          : JobStatus
  created_at      : string
  updated_at      : string
}

export interface Counts {
  posted  : number
  active  : number
  inactive: number
  past    : number
  total   : number
}

export interface ManagedJobsResponse {
  items    : Job[]
  total    : number
  page     : number
  page_size: number
  has_more : boolean
}

export interface PendingJobAction {
  kind  : "status" | "remove"
  jobIds: string[]
  status?: Extract<JobStatus, "active" | "paused">
}

// ── Status badge ──────────────────────────────────────────────
export const StatusBadge = memo(function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, string> = {
    active   : "bg-green-500/10 text-green-500 border-green-500/20",
    paused   : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    removed  : "bg-gray-500/10 text-gray-400 border-gray-500/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  }
  const labels: Record<JobStatus, string> = {
    active: "Active", paused: "Paused",
    removed: "Removed", completed: "Completed",
  }
  return (
    <Badge className={`text-xs border ${map[status]}`}>
      {labels[status]}
    </Badge>
  )
})

export function getPendingActionCopy(action: PendingJobAction | null) {
  if (!action) {
    return {
      title: "Confirm action",
      description: "",
      cta: "Confirm",
      buttonClassName: "bg-primary text-primary-foreground hover:bg-primary/90",
      successMessage: "",
      errorMessage: "Failed to update jobs. Please try again.",
    }
  }

  const count = action.jobIds.length
  const jobLabel = count === 1 ? "this job" : `${count} jobs`

  if (action.kind === "remove") {
    return {
      title: count === 1 ? "Remove this job?" : `Remove ${count} jobs?`,
      description: `This will move ${jobLabel} to Past Jobs and candidates will no longer be able to apply.`,
      cta: count === 1 ? "Remove Job" : `Remove ${count} Jobs`,
      buttonClassName: "bg-red-500 text-white hover:bg-red-500/90",
      successMessage: count === 1 ? "Job moved to Past Jobs." : `${count} jobs moved to Past Jobs.`,
      errorMessage: "Failed to remove the selected jobs. Please try again.",
    }
  }

  if (action.status === "paused") {
    return {
      title: count === 1 ? "Pause this job?" : `Pause ${count} jobs?`,
      description: `Candidates will still see ${jobLabel}, but they will not be able to apply until you resume them.`,
      cta: count === 1 ? "Pause Job" : `Pause ${count} Jobs`,
      buttonClassName: "bg-yellow-500 text-black hover:bg-yellow-500/90",
      successMessage: count === 1 ? "Job paused successfully." : `${count} jobs paused successfully.`,
      errorMessage: "Failed to pause the selected jobs. Please try again.",
    }
  }

  return {
    title: count === 1 ? "Resume this job?" : `Resume ${count} jobs?`,
    description: `Candidates will be able to apply to ${jobLabel} again as soon as you confirm.`,
    cta: count === 1 ? "Resume Job" : `Resume ${count} Jobs`,
    buttonClassName: "bg-green-600 text-white hover:bg-green-600/90",
    successMessage: count === 1 ? "Job resumed successfully." : `${count} jobs resumed successfully.`,
    errorMessage: "Failed to resume the selected jobs. Please try again.",
  }
}

function compactValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  return String(value)
}

export function canOpenRankingForJob(job: Job) {
  return job.status === "active" || job.status === "paused"
}

export const MetaPill = memo(function MetaPill({
  icon: Icon,
  value,
  className,
  iconClassName,
}: {
  icon: LucideIcon
  value: string | number | null | undefined
  className?: string
  iconClassName?: string
}) {
  const resolved = compactValue(value)
  if (!resolved) return null

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/55 px-2.5 py-1 text-[11px] font-medium text-foreground/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:bg-secondary/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <Icon className={cn("h-3.25 w-3.25 text-primary", iconClassName)} />
      <span>{resolved}</span>
    </div>
  )
})

export const SectionPanel = memo(function SectionPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
  defaultOpen = false,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
  className?: string
  defaultOpen?: boolean
}) {
  const isMobile = useIsMobile()
  const header = (
    <div className="flex min-w-0 items-start gap-3 text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
          <TooltipWrapper content={description} className="w-auto">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-card/80 text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
            </span>
          </TooltipWrapper>
        </div>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[1.35rem] border border-border/85 bg-secondary/52 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-secondary/42 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
          className,
        )}
      >
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultOpen ? "content" : undefined}
          className="w-full"
        >
          <AccordionItem value="content" className="border-b-0">
            <AccordionTrigger className="px-4 py-4 hover:no-underline">
              {header}
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4">{children}</div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-[1.45rem] border border-border/85 bg-secondary/52 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-secondary/42 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <div className="mb-5">{header}</div>
      <div className="space-y-5">{children}</div>
    </div>
  )
})

export const JobCard = memo(function JobCard({
  job,
  tab,
  selectionMode,
  selected,
  onOpenRanking,
  onStatusChange,
  onEdit,
  onRemove,
  onView,
  onToggleSelect,
  updating,
  bulkUpdating,
  showNewApplicationDot,
}: {
  job           : Job
  tab           : TabType
  selectionMode : boolean
  selected      : boolean
  onOpenRanking : (job: Job) => void
  onStatusChange: (id: string, status: JobStatus) => void
  onEdit        : (job: Job) => void
  onRemove      : (id: string) => void
  onView        : (job: Job) => void
  onToggleSelect: (id: string) => void
  updating      : string | null
  bulkUpdating  : boolean
  showNewApplicationDot?: boolean
}) {
  const isMobile = useIsMobile()
  const isUpdating = updating === job.id
  const isBusy = isUpdating || bulkUpdating
  const isCardClickable = tab !== "past" && !selectionMode
  const jobVisual = getJobVisual(job)
  const JobTypeIcon = jobVisual.icon
  const handleOpenRanking = () => {
    if (!isCardClickable || isBusy) return
    onOpenRanking(job)
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 rounded-[1.3rem] border border-border/78 bg-card/98 p-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition-all dark:bg-card/92 sm:gap-3 sm:p-3.5",
        isCardClickable
          ? "cursor-pointer hover:border-primary/24 hover:bg-card"
          : "cursor-default",
      )}
      style={WINDOWED_JOB_CARD_STYLE}
      onClick={handleOpenRanking}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && isCardClickable) {
          event.preventDefault()
          handleOpenRanking()
        }
      }}
      role={isCardClickable ? "button" : undefined}
      tabIndex={isCardClickable ? 0 : undefined}
      aria-label={isCardClickable ? `Open ranking for ${job.title}` : undefined}
    >
      {selectionMode && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(job.id)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${job.title}`}
          className="mt-1 shrink-0"
        />
      )}
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset sm:h-10 sm:w-10 sm:rounded-2xl ${jobVisual.surfaceClassName}`}>
        <JobTypeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap sm:gap-2">
            {showNewApplicationDot && (
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
            )}
            <h4 className="text-[13.5px] font-semibold tracking-[-0.02em] text-foreground sm:text-[15px]">{job.title}</h4>
            <StatusBadge status={job.status} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MetaPill icon={Building2} value={job.department} />
            <MetaPill icon={JobTypeIcon} value={job.employment_type} iconClassName={jobVisual.iconClassName} />
            <MetaPill icon={MapPin} value={job.location} />
            {!isMobile && <MetaPill icon={Wallet} value={job.salary} />}
            {!isMobile && <MetaPill icon={Users2} value={job.vacancies ? `${job.vacancies} vacancies` : null} />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MetaPill icon={Clock3} value={new Date(job.created_at).toLocaleDateString()} className="text-muted-foreground" />
            {job.required_skills?.slice(0, isMobile ? 2 : 3).map(s => (
              <Badge key={s} variant="secondary" className="border border-border/65 bg-background/82 px-2.5 py-1 text-[10.5px] font-semibold text-foreground/84">
                {s}
              </Badge>
            ))}
            {(job.required_skills?.length || 0) > (isMobile ? 2 : 3) && (
              <Badge variant="secondary" className="border border-border/65 bg-background/82 px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
                +{job.required_skills.length - (isMobile ? 2 : 3)}
              </Badge>
            )}
          </div>
          {!isMobile && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                Updated {new Date(job.updated_at).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Layers3 className="h-3.5 w-3.5" />
                {job.required_skills?.length || 0} tracked skills
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {isMobile ? (
        <div className="ml-auto flex shrink-0 items-center justify-end self-start" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkUpdating}
                className="h-8 w-8 rounded-xl border-border/60 bg-background/84 p-0 text-muted-foreground hover:text-foreground"
              >
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl">
              <DropdownMenuItem onClick={() => onView(job)} disabled={bulkUpdating}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              {tab !== "past" && job.status === "active" && (
                <DropdownMenuItem onClick={() => onStatusChange(job.id, "paused")} disabled={isBusy}>
                  <Pause className="mr-2 h-4 w-4 text-yellow-500" />
                  Pause
                </DropdownMenuItem>
              )}
              {tab !== "past" && job.status === "paused" && (
                <DropdownMenuItem onClick={() => onEdit(job)} disabled={isBusy}>
                  <Pencil className="mr-2 h-4 w-4 text-blue-500" />
                  Edit
                </DropdownMenuItem>
              )}
              {tab !== "past" && job.status === "paused" && (
                <DropdownMenuItem onClick={() => onStatusChange(job.id, "active")} disabled={isBusy}>
                  <Play className="mr-2 h-4 w-4 text-green-500" />
                  Resume
                </DropdownMenuItem>
              )}
              {tab !== "past" && (
                <DropdownMenuItem onClick={() => onRemove(job.id)} disabled={isBusy}>
                  <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1.5 self-end rounded-[1rem] border border-border/70 bg-secondary/30 p-1.5 dark:bg-secondary/24 sm:self-center"
          onClick={(event) => event.stopPropagation()}
        >
        {/* View Details — all tabs */}
        <TooltipWrapper content="View full job details">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(job)}
              disabled={bulkUpdating}
              className="h-8 rounded-xl border-border bg-background/84 text-muted-foreground hover:text-foreground"
            >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </TooltipWrapper>

        {/* Pause / Activate — not in past tab */}
        {tab !== "past" && (
          <>
            {job.status === "active" ? (
              <TooltipWrapper content="Pause this job — candidates can see it but cannot apply">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusChange(job.id, "paused")}
                  disabled={isBusy}
                  className="h-8 rounded-xl border-yellow-500/35 bg-background/84 text-yellow-600 hover:bg-yellow-500/12 dark:text-yellow-400"
                >
                  {isUpdating
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Pause className="h-3.5 w-3.5" />
                  }
                </Button>
              </TooltipWrapper>
            ) : job.status === "paused" ? (
              <>
                <TooltipWrapper content="Edit this paused job before resuming">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(job)}
                    disabled={isBusy}
                    className="h-8 rounded-xl border-blue-500/35 bg-background/84 text-blue-600 hover:bg-blue-500/12 dark:text-blue-400"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper content="Activate this job — candidates can apply again">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusChange(job.id, "active")}
                    disabled={isBusy}
                    className="h-8 rounded-xl border-green-500/35 bg-background/84 text-green-600 hover:bg-green-500/12 dark:text-green-400"
                  >
                    {isUpdating
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Play className="h-3.5 w-3.5" />
                    }
                  </Button>
                </TooltipWrapper>
              </>
            ) : null}

            {/* Remove */}
            <TooltipWrapper content="Remove this job permanently — moves to Past Jobs">
              <Button
              variant="outline"
              size="sm"
              onClick={() => onRemove(job.id)}
              disabled={isBusy}
              className="h-8 rounded-xl border-red-500/35 bg-background/84 text-red-600 hover:bg-red-500/12 dark:text-red-400"
            >
                {isUpdating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />
                }
              </Button>
            </TooltipWrapper>
          </>
        )}
        </div>
      )}
    </div>
  )
})

// ── Job list tab ──────────────────────────────────────────────
export function JobListTab({
  tab,
  jobs,
  search,
  filterMode,
  total,
  selectionMode,
  selectedJobIds,
  onOpenRanking,
  onStatusChange,
  onEdit,
  onRemove,
  onView,
  onPostJob,
  onToggleSelectionMode,
  onToggleSelectJob,
  onSelectVisibleJobs,
  onClearSelection,
  onBulkPause,
  onBulkResume,
  onBulkRemove,
  onSearchChange,
  onFilterModeChange,
  onLoadMore,
  updating,
  bulkUpdating,
  unseenApplicationJobIds,
  loading,
  loadingMore,
  hasMore,
  loadMoreRef,
}: {
  tab           : Exclude<TabType, "post">
  jobs          : Job[]
  search        : string
  filterMode    : "all" | "with_cgpa" | "with_skills"
  total         : number
  selectionMode : boolean
  selectedJobIds: string[]
  onOpenRanking : (job: Job) => void
  onStatusChange: (id: string, status: JobStatus) => void
  onEdit        : (job: Job) => void
  onRemove      : (id: string) => void
  onView        : (job: Job) => void
  onPostJob     : () => void
  onToggleSelectionMode: () => void
  onToggleSelectJob    : (id: string) => void
  onSelectVisibleJobs  : () => void
  onClearSelection     : () => void
  onBulkPause          : (ids: string[]) => void
  onBulkResume         : (ids: string[]) => void
  onBulkRemove         : (ids: string[]) => void
  onSearchChange: (value: string) => void
  onFilterModeChange: (value: "all" | "with_cgpa" | "with_skills") => void
  onLoadMore    : () => void
  updating      : string | null
  bulkUpdating  : boolean
  unseenApplicationJobIds: Set<string>
  loading       : boolean
  loadingMore   : boolean
  hasMore       : boolean
  loadMoreRef   : React.RefObject<HTMLDivElement | null>
}) {
  const emptyMessages: Record<Exclude<TabType, "post">, { title: string; sub: string }> = {
    posted  : { title: "No posted jobs",  sub: "Post your first job using the button above" },
    active  : { title: "No active jobs",  sub: "Activate a paused job or post a new one" },
    inactive: { title: "No paused jobs",  sub: "All your jobs are currently active" },
    past    : { title: "No past jobs",    sub: "Removed or completed jobs will appear here" },
  }
  const canSelectJobs = tab !== "past"
  const selectedJobs = useMemo(
    () => jobs.filter((job) => selectedJobIds.includes(job.id)),
    [jobs, selectedJobIds],
  )
  const selectedActiveIds = useMemo(
    () => selectedJobs.filter((job) => job.status === "active").map((job) => job.id),
    [selectedJobs],
  )
  const selectedPausedIds = useMemo(
    () => selectedJobs.filter((job) => job.status === "paused").map((job) => job.id),
    [selectedJobs],
  )
  const allVisibleSelected = jobs.length > 0 && jobs.every((job) => selectedJobIds.includes(job.id))
  const isMobile = useIsMobile()
  const [controlsOpen, setControlsOpen] = useState(false)
  const tabMeta: Record<Exclude<TabType, "post">, { title: string; description: string }> = {
    posted: {
      title: "All posted jobs",
      description: "Review every role you've created, search faster, and jump back into a posting whenever needed.",
    },
    active: {
      title: "Active listings",
      description: "These roles are live for candidates. Pause, review, or remove them from one place.",
    },
    inactive: {
      title: "Paused listings",
      description: "Paused jobs stay visible but closed to applications until you resume them.",
    },
    past: {
      title: "Past listings",
      description: "Removed and completed roles stay here for history, reporting, and quick review.",
    },
  }
  const hasTabIndicator = jobs.some((job) => unseenApplicationJobIds.has(job.id))

  return (
    <div className="space-y-4">
      {isMobile ? (
        <div className="rounded-[1.55rem] border border-border/85 bg-card/94 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] dark:bg-card/88">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Job Operations</p>
              <div className="mt-2 flex items-center gap-2">
                {hasTabIndicator && (
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                )}
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{tabMeta[tab].title}</h3>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{tabMeta[tab].description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border/80 bg-secondary/60 px-3 py-1.5 font-medium text-foreground/88">
                {total} total
              </span>
              <span className="rounded-full border border-border/80 bg-secondary/60 px-3 py-1.5">
                {jobs.length} loaded
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Search jobs by title, skill, or department..."
                className="bg-card border-border text-foreground pl-10"
              />
            </div>

            <Collapsible open={controlsOpen} onOpenChange={setControlsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between border-border text-foreground">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    Filters and actions
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {controlsOpen ? "Hide" : "Show"}
                  </span>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <Select
                  value={filterMode}
                  onValueChange={onFilterModeChange}
                >
                  <SelectTrigger className="w-full bg-card border-border text-foreground">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">All Jobs</SelectItem>
                    <SelectItem value="with_cgpa">With CGPA Rule</SelectItem>
                    <SelectItem value="with_skills">With Skills</SelectItem>
                  </SelectContent>
                </Select>
                <TooltipWrapper content="Post a new job opening" className="w-full">
                  <Button
                    onClick={onPostJob}
                    className="w-full bg-primary text-primary-foreground"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Post Job
                  </Button>
                </TooltipWrapper>
                {canSelectJobs && (
                  <Button
                    variant="outline"
                    onClick={onToggleSelectionMode}
                    disabled={loading || bulkUpdating}
                    className="w-full border-border text-muted-foreground hover:text-foreground"
                  >
                    {selectionMode ? "Cancel Selection" : "Select Jobs"}
                  </Button>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      ) : (
        <div className="rounded-[1.45rem] border border-border/70 bg-card/96 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] dark:bg-card/90">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-secondary/60 px-3.5 py-2 text-sm font-semibold text-foreground">
                {hasTabIndicator && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                )}
                {tabMeta[tab].title}
              </span>
              <span className="rounded-2xl border border-border/70 bg-secondary/60 px-3 py-2 text-sm font-medium text-foreground/88">
                {total} total
              </span>
              <span className="rounded-2xl border border-border/70 bg-secondary/60 px-3 py-2 text-sm font-medium text-muted-foreground">
                {jobs.length} loaded
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => onSearchChange(e.target.value)}
                  placeholder="Search jobs..."
                  className="h-11 bg-card border-border text-foreground pl-10"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setControlsOpen((current) => !current)}
                className="h-11 rounded-xl border-border/80 bg-card/98 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              >
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Filter
              </Button>
              <TooltipWrapper content="Post a new job opening" className="w-auto">
                <Button
                  onClick={onPostJob}
                  className="h-11 bg-primary text-primary-foreground shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" /> Post Job
                </Button>
              </TooltipWrapper>
              {canSelectJobs && (
                <Button
                  variant="outline"
                  onClick={onToggleSelectionMode}
                  disabled={loading || bulkUpdating}
                  className="h-11 border-border text-muted-foreground hover:text-foreground shrink-0"
                >
                  {selectionMode ? "Cancel Selection" : "Select Jobs"}
                </Button>
              )}
            </div>
          </div>

          {controlsOpen && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
              <Select
                value={filterMode}
                onValueChange={onFilterModeChange}
              >
                <SelectTrigger className="h-10 w-[220px] bg-card border-border text-foreground">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Jobs</SelectItem>
                  <SelectItem value="with_cgpa">With CGPA Rule</SelectItem>
                  <SelectItem value="with_skills">With Skills</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{tabMeta[tab].description}</p>
            </div>
          )}
        </div>
      )}

      {canSelectJobs && selectionMode && jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[1.3rem] border border-border/85 bg-secondary/48 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-secondary/36">
          <p className="rounded-full border border-border/80 bg-card/86 px-3 py-1.5 text-sm font-medium text-foreground/88">
            {selectedJobIds.length} selected
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectVisibleJobs}
            disabled={bulkUpdating}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            {allVisibleSelected ? "Unselect Visible" : "Select Visible"}
          </Button>
          {selectedJobIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={bulkUpdating}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}
          {selectedActiveIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkPause(selectedActiveIds)}
              disabled={bulkUpdating}
              className="border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10"
            >
              Pause Selected ({selectedActiveIds.length})
            </Button>
          )}
          {selectedPausedIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkResume(selectedPausedIds)}
              disabled={bulkUpdating}
              className="border-green-500/30 text-green-500 hover:bg-green-500/10"
            >
              Resume Selected ({selectedPausedIds.length})
            </Button>
          )}
          {selectedJobIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkRemove(selectedJobIds)}
              disabled={bulkUpdating}
              className="border-red-500/30 text-red-500 hover:bg-red-500/10"
            >
              Remove Selected ({selectedJobIds.length})
            </Button>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-dashed border-border/85 bg-card/88">
          <CardContent className="py-14 text-center space-y-3">
            <ArchiveX className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium text-foreground">{emptyMessages[tab].title}</p>
            <p className="text-sm text-muted-foreground">{emptyMessages[tab].sub}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              tab={tab}
              selectionMode={selectionMode}
              selected={selectedJobIds.includes(job.id)}
              onOpenRanking={onOpenRanking}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onRemove={onRemove}
              onView={onView}
              onToggleSelect={onToggleSelectJob}
              updating={updating}
              bulkUpdating={bulkUpdating}
              showNewApplicationDot={unseenApplicationJobIds.has(job.id)}
            />
          ))}
          <div ref={loadMoreRef} className="h-2 w-full" />
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          {!loadingMore && hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={onLoadMore} className="border-border text-muted-foreground hover:text-foreground">
                Load More
              </Button>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Showing {jobs.length} of {total}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
