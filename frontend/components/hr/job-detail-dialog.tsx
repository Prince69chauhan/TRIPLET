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
  MapPin,
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
  const map: Record<JobStatus, string> = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    paused: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    removed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  }

  const labels: Record<JobStatus, string> = {
    active: "Active",
    paused: "Paused",
    removed: "Removed",
    completed: "Completed",
  }

  return <Badge className={`border text-xs ${map[status]}`}>{labels[status]}</Badge>
}

export function JobDetailDialog({
  job,
  onClose,
}: {
  job: Job | null
  onClose: () => void
}) {
  if (!job) return null

  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-foreground">
            {job.title}
            <StatusBadge status={job.status} />
          </DialogTitle>
          <DialogDescription>
            Posted {new Date(job.created_at).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                Department
              </p>
              <p className="mt-1 break-words text-sm font-medium text-foreground">{detailValue(job.department)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" />
                Job Type
              </p>
              <p className="mt-1 break-words text-sm font-medium text-foreground">{detailValue(job.employment_type)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Location
              </p>
              <p className="mt-1 break-words text-sm font-medium text-foreground">{detailValue(job.location)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <DollarSign className="h-3.5 w-3.5" />
                Salary
              </p>
              <p className="mt-1 break-words text-sm font-medium text-foreground">{detailValue(job.salary)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Vacancies
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{detailValue(job.vacancies, "1")}</p>
            </div>
          </div>

          {job.description && (
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Description</p>
              <div className="rounded-lg bg-secondary/20 p-4">
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{job.description}</p>
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
              <p className="mb-2 text-sm font-medium text-foreground">Required Skills</p>
              <div className="flex flex-wrap gap-2">
                {job.required_skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="bg-secondary text-secondary-foreground">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
