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
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper"
import { jobService } from "@/lib/jobService"
import { markJobApplicationsSeen, subscribeToIndicatorChanges, syncJobApplicationIndicators } from "@/lib/activity-indicators"
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
  Users2,
  type LucideIcon,
} from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"

type JobStatus = "active" | "paused" | "removed" | "completed"
type TabType   = "post" | "posted" | "active" | "inactive" | "past"

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

interface Job {
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

interface Counts {
  posted  : number
  active  : number
  inactive: number
  past    : number
  total   : number
}

interface ManagedJobsResponse {
  items    : Job[]
  total    : number
  page     : number
  page_size: number
  has_more : boolean
}

interface PendingJobAction {
  kind  : "status" | "remove"
  jobIds: string[]
  status?: Extract<JobStatus, "active" | "paused">
}

// ── Status badge ──────────────────────────────────────────────
const StatusBadge = memo(function StatusBadge({ status }: { status: JobStatus }) {
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

function getPendingActionCopy(action: PendingJobAction | null) {
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

function canOpenRankingForJob(job: Job) {
  return job.status === "active" || job.status === "paused"
}

const MetaPill = memo(function MetaPill({
  icon: Icon,
  value,
  className,
}: {
  icon: LucideIcon
  value: string | number | null | undefined
  className?: string
}) {
  const resolved = compactValue(value)
  if (!resolved) return null

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/70 px-3 py-1.5 text-xs font-medium text-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:bg-secondary/60 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span>{resolved}</span>
    </div>
  )
})

const SectionPanel = memo(function SectionPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-[1.45rem] border border-border/85 bg-secondary/52 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] dark:bg-secondary/42 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      <div className="mb-5 flex items-start gap-3">
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
      <div className="space-y-5">{children}</div>
    </div>
  )
})

/* extracted to "@/components/hr/job-detail-dialog"
function detailValue(value: string | number | null | undefined, fallback = "Not specified") {
  return value === null || value === undefined || value === "" ? fallback : String(value)
}

// ── Job detail dialog ─────────────────────────────────────────
const JobDetailDialog = memo(function JobDetailDialog({ job, onClose }: { job: Job | null; onClose: () => void }) {
  if (!job) return null
  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-3">
            {job.title}
            <StatusBadge status={job.status} />
          </DialogTitle>
          <DialogDescription>
            Posted {new Date(job.created_at).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Department
              </p>
              <p className="mt-1 text-sm font-medium text-foreground break-words">{detailValue(job.department)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                Job Type
              </p>
              <p className="mt-1 text-sm font-medium text-foreground break-words">{detailValue(job.employment_type)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Location
              </p>
              <p className="mt-1 text-sm font-medium text-foreground break-words">{detailValue(job.location)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                Salary
              </p>
              <p className="mt-1 text-sm font-medium text-foreground break-words">{detailValue(job.salary)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Vacancies
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{detailValue(job.vacancies, "1")}</p>
            </div>
          </div>

          {job.description && (
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Description</p>
              <div className="rounded-lg bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{job.description}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg bg-secondary/20 p-4">
              <p className="text-sm font-medium text-foreground">Eligibility Criteria</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">10th Minimum</p>
                  <p className="text-sm font-medium text-foreground">{detailValue(job.min_tenth_percentage, "No minimum")}%</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">12th Minimum</p>
                  <p className="text-sm font-medium text-foreground">{detailValue(job.min_twelfth_percentage, "No minimum")}%</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Min CGPA</p>
                  <p className="text-sm font-medium text-foreground">
                    {job.min_cgpa !== null && job.min_cgpa !== undefined
                      ? `${job.min_cgpa} (${(job.min_cgpa * 9.5).toFixed(1)}%)`
                      : "No minimum"}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Passout Range</p>
                  <p className="text-sm font-medium text-foreground">
                    {job.min_passout_year || job.max_passout_year
                      ? `${job.min_passout_year ?? "Any"} - ${job.max_passout_year ?? "Any"}`
                      : "Not specified"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg bg-secondary/20 p-4">
              <p className="text-sm font-medium text-foreground">Hiring Rules</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Gap Allowed</p>
                  <p className="text-sm font-medium text-foreground">{job.allow_gap ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Max Gap Months</p>
                  <p className="text-sm font-medium text-foreground">
                    {job.allow_gap ? detailValue(job.max_gap_months, "No limit specified") : "Not applicable"}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Backlogs Allowed</p>
                  <p className="text-sm font-medium text-foreground">{job.allow_backlogs ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Max Active Backlogs</p>
                  <p className="text-sm font-medium text-foreground">
                    {job.allow_backlogs ? detailValue(job.max_active_backlogs, "No limit specified") : "Not applicable"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg bg-secondary/20 p-4">
            <p className="text-sm font-medium text-foreground">AI Bonus Criteria</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Skill in Project Bonus</p>
                <p className="text-sm font-medium text-foreground">{detailValue(job.bonus_skill_in_project, "None")}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Elite Internship Bonus</p>
                <p className="text-sm font-medium text-foreground">{detailValue(job.bonus_elite_internship, "None")}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Project Level Bonus</p>
                <p className="text-sm font-medium text-foreground">{detailValue(job.bonus_project_level, "None")}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground">Internship Duration Bonus</p>
                <p className="text-sm font-medium text-foreground">{detailValue(job.bonus_internship_duration, "None")}</p>
              </div>
            </div>
          </div>

          {job.required_skills?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Required Skills</p>
              <div className="flex flex-wrap gap-2">
                {job.required_skills.map(s => (
                  <Badge key={s} variant="secondary" className="bg-secondary text-secondary-foreground">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})

// ── Job card ──────────────────────────────────────────────────
*/
const JobCard = memo(function JobCard({
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
  const isUpdating = updating === job.id
  const isBusy = isUpdating || bulkUpdating
  const isCardClickable = tab !== "past" && !selectionMode
  const handleOpenRanking = () => {
    if (!isCardClickable || isBusy) return
    onOpenRanking(job)
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-4 rounded-[1.45rem] border border-border/85 bg-card/94 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition-all dark:bg-card/88",
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {showNewApplicationDot && (
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
              )}
              <h4 className="text-base font-semibold tracking-[-0.02em] text-foreground">{job.title}</h4>
              <StatusBadge status={job.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <MetaPill icon={Building2} value={job.department} />
              <MetaPill icon={Briefcase} value={job.employment_type} />
              <MetaPill icon={MapPin} value={job.location} />
              <MetaPill icon={Wallet} value={job.salary} />
              <MetaPill icon={Users2} value={job.vacancies ? `${job.vacancies} vacancies` : null} />
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-secondary/55 px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-secondary/42">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Posted</p>
            <p className="mt-1 text-sm font-medium text-foreground">{new Date(job.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.required_skills?.slice(0, 3).map(s => (
            <Badge key={s} variant="secondary" className="border border-border/70 bg-secondary/60 text-xs text-foreground/88">
              {s}
            </Badge>
          ))}
          {(job.required_skills?.length || 0) > 3 && (
            <Badge variant="secondary" className="border border-border/70 bg-secondary/60 text-xs text-muted-foreground">
              +{job.required_skills.length - 3}
            </Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            Updated {new Date(job.updated_at).toLocaleDateString()}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5" />
            {job.required_skills?.length || 0} tracked skills
          </span>
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 self-center rounded-2xl border border-border/75 bg-secondary/48 p-2 dark:bg-secondary/36"
        onClick={(event) => event.stopPropagation()}
      >
        {/* View Details — all tabs */}
        <TooltipWrapper content="View full job details">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(job)}
              disabled={bulkUpdating}
              className="h-8 border-border text-muted-foreground hover:text-foreground"
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
                  className="h-8 border-yellow-500/35 text-yellow-600 hover:bg-yellow-500/12 dark:text-yellow-400"
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
                    className="h-8 border-blue-500/35 text-blue-600 hover:bg-blue-500/12 dark:text-blue-400"
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
                    className="h-8 border-green-500/35 text-green-600 hover:bg-green-500/12 dark:text-green-400"
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
                className="h-8 border-red-500/35 text-red-600 hover:bg-red-500/12 dark:text-red-400"
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
    </div>
  )
})

// ── Job list tab ──────────────────────────────────────────────
function JobListTab({
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
      {/* Search + filter + post job */}
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

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search jobs by title, skill, or department..."
              className="bg-card border-border text-foreground pl-10"
            />
          </div>
          <Select
            value={filterMode}
            onValueChange={onFilterModeChange}
          >
            <SelectTrigger className="w-[180px] bg-card border-border text-foreground">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Jobs</SelectItem>
              <SelectItem value="with_cgpa">With CGPA Rule</SelectItem>
              <SelectItem value="with_skills">With Skills</SelectItem>
            </SelectContent>
          </Select>
          <TooltipWrapper content="Post a new job opening" className="w-auto">
            <Button
              onClick={onPostJob}
              className="bg-primary text-primary-foreground shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" /> Post Job
            </Button>
          </TooltipWrapper>
          {canSelectJobs && (
            <Button
              variant="outline"
              onClick={onToggleSelectionMode}
              disabled={loading || bulkUpdating}
              className="border-border text-muted-foreground hover:text-foreground shrink-0"
            >
              {selectionMode ? "Cancel Selection" : "Select Jobs"}
            </Button>
          )}
        </div>
      </div>

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
export function PostJobSection() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
        const stats = await jobService.getJobAnalytics({ force: true }) as Array<{ job_id: string; total_applications: number }>
        if (!active) return
        const unseenIds = syncJobApplicationIndicators(
          "hr",
          Array.isArray(stats)
            ? stats.map((job) => ({ jobId: job.job_id, totalApplications: job.total_applications ?? 0 }))
            : [],
        )
        setUnseenApplicationJobIds(new Set(unseenIds))
      } catch {
        if (active) {
          setUnseenApplicationJobIds(new Set())
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

  return (
    <div className="space-y-6">
      <Card className="border-border/90 bg-card/94 shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:bg-card/88">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Hiring Command Center</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">Manage every job lifecycle from one workspace</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Post new openings, keep active listings healthy, pause roles safely, and maintain a clean record of past jobs without leaving this screen.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/85 bg-secondary/56 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total Jobs</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{counts.total}</p>
              </div>
              <div className="rounded-2xl border border-border/85 bg-secondary/56 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{counts.active}</p>
              </div>
              <div className="rounded-2xl border border-border/85 bg-secondary/56 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Paused</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{counts.inactive}</p>
              </div>
              <div className="rounded-2xl border border-border/85 bg-secondary/56 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Past</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{counts.past}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tab buttons ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {tabs.map(tab => {
          const Icon     = tab.icon
          const isActive = activeTab === tab.id
          return (
            <TooltipWrapper key={tab.id} content={tabDescriptions[tab.id]}>
              <Card
                onClick={() => handleTabChange(tab.id, tab.id === "post" ? "form" : "list")}
                className={`
                  cursor-pointer border-border/85 transition-all hover:-translate-y-0.5 hover:border-primary/24
                  ${isActive
                    ? tabColors[tab.id]
                    : "bg-card/92 text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${isActive ? "border-primary/25 bg-primary/18" : "border-border/70 bg-secondary/68"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  {tab.count !== null ? (
                    <div className={`rounded-xl border px-3 py-2 text-right ${isActive ? "border-current/20 bg-white/14 dark:bg-black/10" : "border-border/75 bg-secondary/55 text-foreground"}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Count</p>
                        <p className="mt-1 text-xl font-semibold tracking-[-0.03em]">{tab.count}</p>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="border border-primary/20 bg-primary/10 text-primary">
                        Create
                      </Badge>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center gap-2">
                      {hasIndicatorForTab(tab.id) && (
                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                      )}
                      <p className={`text-sm font-semibold tracking-[-0.01em] ${isActive ? "text-current" : "text-foreground"}`}>{tab.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TooltipWrapper>
          )
        })}
      </div>

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

          {/* ── Recent Job Postings ── */}
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
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {recentJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No jobs posted yet.
                  </p>
                ) : recentJobs.map(job => (
                  <div
                    key={job.id}
                    className={cn(
                      "rounded-[1.25rem] border border-border/80 bg-secondary/40 p-4 transition-all",
                      canOpenRankingForJob(job)
                        ? "cursor-pointer hover:border-primary/20 hover:bg-secondary/55"
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {unseenApplicationJobIds.has(job.id) && (
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                          )}
                          <p className="font-medium text-foreground text-sm truncate">{job.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Posted {new Date(job.created_at).toLocaleDateString()}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <MetaPill icon={Briefcase} value={job.employment_type} />
                          <MetaPill icon={MapPin} value={job.location} />
                        </div>
                      </div>
                      <StatusBadge status={job.status as JobStatus} />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        setViewJob(job)
                      }}
                      className="mt-2 border-border text-muted-foreground hover:text-foreground text-xs h-7"
                    >
                      <Eye className="h-3 w-3 mr-1" /> View Details
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
