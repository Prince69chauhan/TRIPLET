"use client"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Briefcase,
  Calendar,
  DollarSign,
  GraduationCap,
  MapPin,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
} from "lucide-react"

type JobStatus = "active" | "paused" | "removed" | "completed"

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
  min_passout_year: number | null
  max_passout_year: number | null
  allow_gap: boolean
  max_gap_months?: number | null
  allow_backlogs: boolean
  max_active_backlogs?: number | null
  bonus_skill_in_project?: number | null
  bonus_elite_internship?: number | null
  bonus_project_level?: number | null
  bonus_internship_duration?: number | null
  status: JobStatus
  created_at: string
}

function detailValue(value: string | number | null | undefined, fallback = "Not specified") {
  return value === null || value === undefined || value === "" ? fallback : String(value)
}

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { cls: string; dot: string; label: string }> = {
    active:    { cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/25", dot: "bg-emerald-500", label: "Active" },
    paused:    { cls: "bg-amber-500/10 text-amber-500 border-amber-500/25",       dot: "bg-amber-400",  label: "Paused" },
    removed:   { cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",           dot: "bg-zinc-400",   label: "Removed" },
    completed: { cls: "bg-blue-500/10 text-blue-400 border-blue-500/25",           dot: "bg-blue-400",   label: "Completed" },
  }
  const { cls, dot, label } = map[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-3 border-b border-border/50">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 px-3.5 py-3 dark:bg-background/30">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-semibold text-foreground leading-snug">{value}</p>
    </div>
  )
}

export function JobDetailDialog({
  job,
  onClose,
}: {
  job: Job | null
  onClose: () => void
}) {
  if (!job) return null

  const stats = [
    { icon: Calendar,    label: "Department",  value: detailValue(job.department) },
    { icon: Briefcase,   label: "Job Type",    value: detailValue(job.employment_type) },
    { icon: MapPin,      label: "Location",    value: detailValue(job.location) },
    { icon: DollarSign,  label: "Salary",      value: detailValue(job.salary) },
    { icon: Users,       label: "Vacancies",   value: detailValue(job.vacancies, "1") },
  ]

  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto border-border/70 bg-card p-0 shadow-[0_24px_48px_rgba(15,23,42,0.12)] dark:shadow-[0_32px_64px_rgba(0,0,0,0.5)] sm:w-full">

        {/* ── Header ─────────────────────────────────────────── */}
        <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-5 py-4 backdrop-blur-md sm:px-7 sm:py-5">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2 pr-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Briefcase className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[18px] font-bold tracking-tight text-foreground leading-snug sm:text-[20px] break-words">
                {job.title}
              </DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge status={job.status} />
                <DialogDescription className="flex items-center gap-1 text-[12px] text-muted-foreground m-0">
                  <Calendar className="h-3 w-3" />
                  Posted {new Date(job.created_at).toLocaleDateString()}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-5 pb-7 pt-5 sm:px-7">

          {/* ── Stats strip ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/50 px-3.5 py-3 dark:bg-secondary/20"
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3 w-3" />
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none truncate">
                    {label}
                  </p>
                </div>
                <p className="text-sm font-bold text-foreground leading-snug">{value}</p>
              </div>
            ))}
          </div>

          {/* ── Description ─────────────────────────────────── */}
          {job.description && (
            <div className="space-y-3">
              <SectionHeading icon={Briefcase} title="Job Description" />
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground/80 px-1">
                {job.description}
              </p>
            </div>
          )}

          {/* ── Required Skills ─────────────────────────────── */}
          {job.required_skills?.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 pb-3 border-b border-border/50">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Tag className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Required Skills</h3>
                <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">
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

          {/* ── Eligibility + Hiring Rules ───────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/40 p-4 dark:bg-secondary/15">
              <SectionHeading icon={GraduationCap} title="Eligibility Criteria" />
              <div className="grid grid-cols-2 gap-2.5">
                <InfoCell
                  label="10th Minimum"
                  value={`${detailValue(job.min_tenth_percentage, "—")}${job.min_tenth_percentage != null ? "%" : ""}`}
                />
                <InfoCell
                  label="12th Minimum"
                  value={`${detailValue(job.min_twelfth_percentage, "—")}${job.min_twelfth_percentage != null ? "%" : ""}`}
                />
                <InfoCell
                  label="Min CGPA"
                  value={
                    job.min_cgpa != null
                      ? `${job.min_cgpa} / 10`
                      : "No minimum"
                  }
                />
                <InfoCell
                  label="Passout Range"
                  value={
                    job.min_passout_year || job.max_passout_year
                      ? `${job.min_passout_year ?? "Any"} – ${job.max_passout_year ?? "Any"}`
                      : "Not specified"
                  }
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/40 p-4 dark:bg-secondary/15">
              <SectionHeading icon={ShieldCheck} title="Hiring Rules" />
              <div className="grid grid-cols-2 gap-2.5">
                <InfoCell
                  label="Gap Allowed"
                  value={
                    <span className={job.allow_gap ? "text-emerald-500" : "text-rose-400"}>
                      {job.allow_gap ? "Yes" : "No"}
                    </span>
                  }
                />
                <InfoCell
                  label="Max Gap"
                  value={job.allow_gap ? detailValue(job.max_gap_months, "No limit") + (job.max_gap_months != null ? " mo" : "") : "N/A"}
                />
                <InfoCell
                  label="Backlogs Allowed"
                  value={
                    <span className={job.allow_backlogs ? "text-emerald-500" : "text-rose-400"}>
                      {job.allow_backlogs ? "Yes" : "No"}
                    </span>
                  }
                />
                <InfoCell
                  label="Max Backlogs"
                  value={job.allow_backlogs ? detailValue(job.max_active_backlogs, "No limit") : "N/A"}
                />
              </div>
            </div>
          </div>

          {/* ── AI Bonus Criteria ────────────────────────────── */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/40 p-4 dark:bg-secondary/15">
            <SectionHeading icon={Sparkles} title="AI Bonus Criteria" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: "Skill in Project",      value: detailValue(job.bonus_skill_in_project, "None") },
                { label: "Elite Internship",       value: detailValue(job.bonus_elite_internship, "None") },
                { label: "Project Level",          value: detailValue(job.bonus_project_level, "None") },
                { label: "Internship Duration",    value: detailValue(job.bonus_internship_duration, "None") },
              ].map((b) => (
                <InfoCell key={b.label} label={b.label} value={b.value} />
              ))}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
