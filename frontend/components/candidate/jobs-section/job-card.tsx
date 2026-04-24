"use client"

import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper"
import { useIsMobile } from "@/hooks/use-mobile"
import { getJobVisual } from "@/lib/job-visuals"
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  MapPin,
  MoreHorizontal,
  Send,
  Users2,
} from "lucide-react"
import { formatDate, getJobLifecycleBadge, getStatusColor } from "./shared"
import type { AppliedJob, Job, JobLifecycleStatus, Tab } from "./types"

const WINDOWED_CARD_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "165px",
} as const

export const JobCard = memo(function JobCard({
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
  const isMobile = useIsMobile()
  const appliedJob = job as AppliedJob
  const jobStatus = (tab === "applied" ? appliedJob.job_status : job.status) as JobLifecycleStatus | undefined
  const lifecycleBadge = getJobLifecycleBadge(jobStatus)
  const canApply = jobStatus === undefined || jobStatus === "active"
  const leadIcon = getJobVisual(job)
  const LeadIcon = leadIcon.icon
  const showPrimaryApplyButton = isMobile && tab !== "applied"

  return (
    <Card
      className="group overflow-hidden rounded-[1.3rem] border border-border/70 bg-card/98 py-0 transition-all duration-200 hover:border-primary/25 hover:shadow-[0_6px_18px_rgba(15,23,42,0.05)] dark:hover:shadow-[0_8px_22px_rgba(0,0,0,0.26)]"
      style={WINDOWED_CARD_STYLE}
    >
      <CardContent className="p-3.5 sm:p-4.5">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${leadIcon.surfaceClassName}`}>
            <LeadIcon className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {showNewDot && (
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                  )}
                  <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground sm:text-[16px]">
                    {job.title}
                  </h3>
                  {lifecycleBadge && (
                    <Badge className={`border text-[10px] font-semibold ${lifecycleBadge.className}`}>
                      {lifecycleBadge.label}
                    </Badge>
                  )}
                  {tab === "applied" && (
                    <Badge className={`border-0 px-2.5 py-0.5 text-[10.5px] font-semibold ${getStatusColor(appliedJob.status)}`}>
                      {appliedJob.status}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {job.department && (
                    <Badge variant="secondary" className="rounded-full border border-border/60 bg-secondary/35 px-2.5 py-1 text-[11px] font-medium">
                      {job.department}
                    </Badge>
                  )}
                  {job.employment_type && (
                    <Badge variant="secondary" className="rounded-full border border-border/60 bg-secondary/35 px-2.5 py-1 text-[11px] font-medium">
                      {job.employment_type}
                    </Badge>
                  )}
                  {job.salary && (
                    <Badge variant="secondary" className="rounded-full border border-border/60 bg-secondary/35 px-2.5 py-1 text-[11px] font-medium">
                      {job.salary}
                    </Badge>
                  )}
                  {tab === "available" && canApply && (
                    <Badge className="rounded-full border border-green-500/25 bg-green-500/10 px-2.5 py-1 text-[11px] font-semibold text-green-500">
                      Open
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  {job.location && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                      <MapPin className="h-3 w-3" />
                      {job.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                    <Clock className="h-3 w-3" />
                    Posted <span className="font-semibold text-foreground/80">{formatDate(job.created_at)}</span>
                  </span>
                  {tab === "applied" && "applied_at" in appliedJob && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                      <CheckCircle2 className="h-3 w-3 text-primary" />
                      Applied <span className="font-semibold text-foreground/80">{formatDate(appliedJob.applied_at)}</span>
                    </span>
                  )}
                  {tab === "saved" && "saved_at" in job && job.saved_at && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                      <BookmarkCheck className="h-3 w-3 text-primary" />
                      Saved <span className="font-semibold text-foreground/70">{formatDate(job.saved_at)}</span>
                    </span>
                  )}
                  {job.vacancies ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                      <Users2 className="h-3 w-3" />
                      {job.vacancies} vacancies
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-start gap-2 self-start" onClick={(event) => event.stopPropagation()}>
                {isMobile ? (
                  <>
                    {showPrimaryApplyButton && (
                      <Button
                        onClick={() => onApply(job.id)}
                        disabled={applying === job.id || isApplied || !canApply}
                        size="sm"
                        className="h-8 rounded-xl bg-primary px-3 text-[11.5px] font-bold text-primary-foreground shadow-[0_2px_10px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 rounded-xl border-border/60 bg-background/84 p-0 text-muted-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-xl">
                        <DropdownMenuItem onClick={() => onView(job)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        {tab === "available" && (
                          isSaved ? (
                            <DropdownMenuItem onClick={() => onUnsave(job.id)} disabled={saving === job.id}>
                              <BookmarkCheck className="mr-2 h-4 w-4" />
                              Unsave
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => onSave(job.id)} disabled={saving === job.id}>
                              <Bookmark className="mr-2 h-4 w-4" />
                              Save
                            </DropdownMenuItem>
                          )
                        )}
                        {!showPrimaryApplyButton && tab !== "applied" && (
                          <DropdownMenuItem onClick={() => onApply(job.id)} disabled={applying === job.id || isApplied || !canApply}>
                            <Send className="mr-2 h-4 w-4" />
                            Quick Apply
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    <TooltipWrapper content="View full job details" className="w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onView(job)}
                        className="h-9 rounded-xl border-border/60 bg-background/82 px-3 text-[12px] font-semibold text-foreground"
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                    </TooltipWrapper>

                    {tab === "available" && (
                      <>
                        <TooltipWrapper content={isSaved ? "Remove this job from saved jobs" : "Save this job for later"} className="w-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => isSaved ? onUnsave(job.id) : onSave(job.id)}
                            disabled={saving === job.id}
                            className="h-9 rounded-xl border-border/60 bg-background/82 px-3 text-[12px] font-semibold text-foreground"
                          >
                            {saving === job.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isSaved ? (
                              <>
                                <BookmarkCheck className="mr-1.5 h-3.5 w-3.5" />
                                Saved
                              </>
                            ) : (
                              <>
                                <Bookmark className="mr-1.5 h-3.5 w-3.5" />
                                Save
                              </>
                            )}
                          </Button>
                        </TooltipWrapper>
                        <Button
                          onClick={() => onApply(job.id)}
                          disabled={applying === job.id || isApplied || !canApply}
                          size="sm"
                          className="h-9 rounded-xl bg-primary px-3 text-[11.5px] font-bold text-primary-foreground shadow-[0_2px_10px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
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
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
