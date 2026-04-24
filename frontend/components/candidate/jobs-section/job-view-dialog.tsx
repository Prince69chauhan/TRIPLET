"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { getJobVisual } from "@/lib/job-visuals"
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  GraduationCap,
  Loader2,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Users2,
  Briefcase,
} from "lucide-react"
import {
  CandidateDetailInfoCell,
  CandidateDetailSectionHeading,
  CandidateDetailStatRow,
  formatDate,
  formatValue,
  getJobLifecycleBadge,
  getStatusColor,
} from "./shared"
import type { AppliedJob, Job, JobLifecycleStatus, Tab } from "./types"

export function JobViewDialog({
  activeTab,
  applying,
  isApplied,
  job,
  onApply,
  onClose,
}: {
  activeTab: Tab
  applying: string | null
  isApplied: boolean
  job: Job | AppliedJob | null
  onApply: (id: string) => void
  onClose: () => void
}) {
  const isMobile = useIsMobile()

  if (!job) {
    return null
  }

  const lifecycleStatus = (
    activeTab === "applied" && "job_status" in job
      ? job.job_status
      : job.status
  ) as JobLifecycleStatus | undefined
  const lifecycleBadge = getJobLifecycleBadge(lifecycleStatus)
  const LifecycleIcon = lifecycleBadge?.icon
  const viewJobCanApply = lifecycleStatus === undefined || lifecycleStatus === "active"
  const viewJobVisual = getJobVisual(job)
  const ViewJobIcon = viewJobVisual.icon

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto border-border/70 bg-card p-0 shadow-[0_24px_48px_rgba(15,23,42,0.12)] dark:shadow-[0_32px_64px_rgba(0,0,0,0.5)] sm:w-full">
        <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md sm:px-7 sm:py-5">
          <div className="flex items-start gap-3 pr-8">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${viewJobVisual.surfaceClassName}`}>
              <ViewJobIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-normal whitespace-normal text-[18px] font-bold leading-snug tracking-tight text-foreground sm:text-[20px]">
                {job.title}
              </DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {"status" in job && typeof job.status === "string" && activeTab === "applied" && (
                  <Badge className={`text-xs border-0 ${getStatusColor(job.status)}`}>
                    {job.status}
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
                    Posted {formatDate(job.created_at)}
                  </span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:space-y-6 sm:px-7 sm:py-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { icon: Calendar, label: "Department", value: formatValue(job.department) },
              { icon: ViewJobIcon, label: "Job Type", value: formatValue(job.employment_type) },
              { icon: MapPin, label: "Location", value: formatValue(job.location) },
              { icon: DollarSign, label: "Salary", value: formatValue(job.salary) },
              { icon: Users2, label: "Vacancies", value: formatValue(job.vacancies, "1") },
            ].map((item) => (
              <CandidateDetailStatRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>

          {isMobile ? (
            <Accordion type="multiple" defaultValue={["description"]} className="rounded-xl border border-border/60 bg-muted/40 dark:bg-secondary/15">
              {job.description && (
                <AccordionItem value="description" className="border-border/50 px-4">
                  <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      Job Description
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <p className="break-normal whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">
                      {job.description}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              )}

              {job.required_skills?.length > 0 && (
                <AccordionItem value="skills" className="border-border/50 px-4">
                  <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      Required Skills
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                        {job.required_skills.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="flex flex-wrap gap-2">
                      {job.required_skills.map((skill) => (
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              <AccordionItem value="eligibility" className="border-border/50 px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Eligibility Criteria
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="grid grid-cols-1 gap-3">
                    <CandidateDetailInfoCell label="10th Minimum" value={`${formatValue(job.min_tenth_percentage, "No minimum")}%`} />
                    <CandidateDetailInfoCell label="12th Minimum" value={`${formatValue(job.min_twelfth_percentage, "No minimum")}%`} />
                    <CandidateDetailInfoCell label="Min CGPA" value={job.min_cgpa != null ? `${job.min_cgpa} / 10` : "No minimum"} />
                    <CandidateDetailInfoCell
                      label="Passout Range"
                      value={job.min_passout_year || job.max_passout_year ? `${job.min_passout_year ?? "Any"} - ${job.max_passout_year ?? "Any"}` : "Not specified"}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="rules" className="border-border/50 px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Hiring Rules
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="grid grid-cols-1 gap-3">
                    <CandidateDetailInfoCell label="Gap Allowed" value={job.allow_gap ? "Yes" : "No"} />
                    <CandidateDetailInfoCell label="Max Gap" value={job.allow_gap ? formatValue(job.max_gap_months, "No limit") : "N/A"} />
                    <CandidateDetailInfoCell label="Backlogs Allowed" value={job.allow_backlogs ? "Yes" : "No"} />
                    <CandidateDetailInfoCell label="Max Backlogs" value={job.allow_backlogs ? formatValue(job.max_active_backlogs, "No limit") : "N/A"} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="bonus" className="border-border/50 px-4">
                <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Bonus Criteria
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="grid grid-cols-1 gap-3">
                    <CandidateDetailInfoCell label="Skill in Project" value={formatValue(job.bonus_skill_in_project, "None")} />
                    <CandidateDetailInfoCell label="Elite Internship" value={formatValue(job.bonus_elite_internship, "None")} />
                    <CandidateDetailInfoCell label="Project Level" value={formatValue(job.bonus_project_level, "None")} />
                    <CandidateDetailInfoCell label="Internship Duration" value={formatValue(job.bonus_internship_duration, "None")} />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {activeTab === "applied" && "applied_at" in job && (
                <AccordionItem value="application" className="border-b-0 px-4">
                  <AccordionTrigger className="py-3 text-sm font-semibold text-foreground hover:no-underline">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      Your Application
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="grid grid-cols-1 gap-3">
                      <CandidateDetailInfoCell label="Applied On" value={formatDate(job.applied_at)} />
                      <CandidateDetailInfoCell label="Application Status" value={formatValue(job.status)} />
                      <CandidateDetailInfoCell label="AI Score" value={formatValue(job.final_score_d, "Pending")} />
                      <CandidateDetailInfoCell
                        label="Hard Filter"
                        value={job.passed_hard_filter === null ? "Pending" : job.passed_hard_filter ? "Passed" : "Failed"}
                      />
                    </div>
                    {job.filter_fail_reason && (
                      <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                        <p className="text-xs text-red-400">Filter Reason</p>
                        <p className="text-sm text-red-300">{job.filter_fail_reason}</p>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          ) : (
            <>
              {job.description && (
                <div className="space-y-3">
                  <CandidateDetailSectionHeading icon={ClipboardList} title="Job Description" />
                  <p className="break-normal whitespace-pre-wrap px-1 text-[13.5px] leading-relaxed text-foreground/80">
                    {job.description}
                  </p>
                </div>
              )}

              {job.required_skills?.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 border-b border-border/50 pb-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                      <Tag className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Required Skills</h3>
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">
                      {job.required_skills.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-1">
                    {job.required_skills.map((skill) => (
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
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:bg-secondary/20">
                  <CandidateDetailSectionHeading icon={GraduationCap} title="Eligibility Criteria" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <CandidateDetailInfoCell label="10th Minimum" value={`${formatValue(job.min_tenth_percentage, "No minimum")}%`} />
                    <CandidateDetailInfoCell label="12th Minimum" value={`${formatValue(job.min_twelfth_percentage, "No minimum")}%`} />
                    <CandidateDetailInfoCell label="Min CGPA" value={job.min_cgpa != null ? `${job.min_cgpa} / 10` : "No minimum"} />
                    <CandidateDetailInfoCell
                      label="Passout Range"
                      value={job.min_passout_year || job.max_passout_year ? `${job.min_passout_year ?? "Any"} - ${job.max_passout_year ?? "Any"}` : "Not specified"}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:bg-secondary/20">
                  <CandidateDetailSectionHeading icon={ShieldCheck} title="Hiring Rules" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <CandidateDetailInfoCell label="Gap Allowed" value={job.allow_gap ? "Yes" : "No"} />
                    <CandidateDetailInfoCell label="Max Gap" value={job.allow_gap ? formatValue(job.max_gap_months, "No limit") : "N/A"} />
                    <CandidateDetailInfoCell label="Backlogs Allowed" value={job.allow_backlogs ? "Yes" : "No"} />
                    <CandidateDetailInfoCell label="Max Backlogs" value={job.allow_backlogs ? formatValue(job.max_active_backlogs, "No limit") : "N/A"} />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:bg-secondary/20">
                <CandidateDetailSectionHeading icon={Sparkles} title="AI Bonus Criteria" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  <CandidateDetailInfoCell label="Skill in Project" value={formatValue(job.bonus_skill_in_project, "None")} />
                  <CandidateDetailInfoCell label="Elite Internship" value={formatValue(job.bonus_elite_internship, "None")} />
                  <CandidateDetailInfoCell label="Project Level" value={formatValue(job.bonus_project_level, "None")} />
                  <CandidateDetailInfoCell label="Internship Duration" value={formatValue(job.bonus_internship_duration, "None")} />
                </div>
              </div>

              {activeTab === "applied" && "applied_at" in job && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted/60 p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:bg-secondary/20">
                  <CandidateDetailSectionHeading icon={ClipboardList} title="Your Application" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <CandidateDetailInfoCell label="Applied On" value={formatDate(job.applied_at)} />
                    <CandidateDetailInfoCell label="Application Status" value={formatValue(job.status)} />
                    <CandidateDetailInfoCell label="AI Score" value={formatValue(job.final_score_d, "Pending")} />
                    <CandidateDetailInfoCell
                      label="Hard Filter"
                      value={job.passed_hard_filter === null ? "Pending" : job.passed_hard_filter ? "Passed" : "Failed"}
                    />
                  </div>
                  {job.filter_fail_reason && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                      <p className="text-xs text-red-400">Filter Reason</p>
                      <p className="text-sm text-red-300">{job.filter_fail_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {activeTab !== "applied" && (
          <div className="sticky bottom-0 z-10 border-t border-border/50 bg-card/97 px-5 py-3.5 backdrop-blur-xl sm:px-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12.5px] text-muted-foreground">
                {isApplied
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
                onClick={() => onApply(job.id)}
                disabled={applying === job.id || isApplied || !viewJobCanApply}
                className="min-w-[170px] bg-primary text-primary-foreground"
              >
                {applying === job.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : isApplied ? (
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
      </DialogContent>
    </Dialog>
  )
}
