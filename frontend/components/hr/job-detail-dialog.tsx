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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2.5 border-b border-border/40">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
    </div>
  )
}

// Compact horizontal row: icon + label (fixed width) + value (truncates)
function StatRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-secondary/40 px-3 py-2.5 dark:bg-secondary/30">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
        <Icon className="h-3 w-3" />
      </div>
      <span className="w-20 shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground break-keep whitespace-normal">
        {label}
      </span>
      <span className="flex-1 break-keep whitespace-normal text-[13px] font-semibold text-foreground" title={value}>
        {value}
      </span>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border/40 bg-background/50 px-3 py-2.5 dark:bg-background/20">
      <p className="mb-0.5 text-[10.5px] font-medium text-muted-foreground break-keep whitespace-normal">{label}</p>
      <div className="text-[13px] font-semibold text-foreground leading-snug break-keep whitespace-normal">{value}</div>
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
    { icon: Calendar,   label: "Department", value: detailValue(job.department) },
    { icon: Briefcase,  label: "Job Type",   value: detailValue(job.employment_type) },
    { icon: MapPin,     label: "Location",   value: detailValue(job.location) },
    { icon: DollarSign, label: "Salary",     value: detailValue(job.salary) },
    { icon: Users,      label: "Vacancies",  value: detailValue(job.vacancies, "1") },
  ]

  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto border-border/60 bg-card p-0 sm:w-full">

        {/* ── Header ─────────────────────────────────────────── */}
        <DialogHeader className="sticky top-0 z-10 border-b border-border/50 bg-card/97 px-5 py-3.5 backdrop-blur-xl sm:px-7 sm:py-4">
          <div className="flex items-start gap-3 pr-8">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-normal whitespace-normal text-[17px] font-bold leading-snug tracking-[-0.02em] text-foreground sm:text-[18px]">
                {job.title}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={job.status} />
                <DialogDescription className="m-0 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="whitespace-nowrap">
                    Posted {new Date(job.created_at).toLocaleDateString()}
                  </span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-6 pt-4 sm:px-7">

          {/* ── Stats — single column rows, nothing ever wraps ── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {stats.map((s) => (
              <StatRow key={s.label} icon={s.icon} label={s.label} value={s.value} />
            ))}
          </div>

          {/* ── Description ─────────────────────────────────── */}
          {job.description && (
            <div className="space-y-3">
              <SectionHeading icon={Briefcase} title="Job Description" />
              <p className="break-normal whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/80 px-1">
                {job.description}
              </p>
            </div>
          )}

          {/* ── Required Skills ─────────────────────────────── */}
          {job.required_skills?.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 pb-2.5 border-b border-border/40">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-[13px] font-semibold text-foreground">Required Skills</h3>
                <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {job.required_skills.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {job.required_skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/12"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* ── Eligibility + Hiring Rules ───────────────────── */}
          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-4 dark:bg-secondary/10">
              <SectionHeading icon={GraduationCap} title="Eligibility Criteria" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoCell
                  label="10th Minimum"
                  value={job.min_tenth_percentage != null ? `${job.min_tenth_percentage}%` : "No minimum"}
                />
                <InfoCell
                  label="12th Minimum"
                  value={job.min_twelfth_percentage != null ? `${job.min_twelfth_percentage}%` : "No minimum"}
                />
                <InfoCell
                  label="Min CGPA"
                  value={job.min_cgpa != null ? `${job.min_cgpa} / 10` : "No minimum"}
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

            <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-4 dark:bg-secondary/10">
              <SectionHeading icon={ShieldCheck} title="Hiring Rules" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  value={
                    job.allow_gap
                      ? job.max_gap_months != null ? `${job.max_gap_months} mo` : "No limit"
                      : "N/A"
                  }
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
                  value={
                    job.allow_backlogs
                      ? job.max_active_backlogs != null ? String(job.max_active_backlogs) : "No limit"
                      : "N/A"
                  }
                />
              </div>
            </div>
          </div>

          {/* ── AI Bonus Criteria ────────────────────────────── */}
          <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-4 dark:bg-secondary/10">
            <SectionHeading icon={Sparkles} title="AI Bonus Criteria" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
              {[
                { label: "Skill in Project",   value: detailValue(job.bonus_skill_in_project, "None") },
                { label: "Elite Internship",   value: detailValue(job.bonus_elite_internship, "None") },
                { label: "Project Level",      value: detailValue(job.bonus_project_level, "None") },
                { label: "Internship Duration",value: detailValue(job.bonus_internship_duration, "None") },
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
