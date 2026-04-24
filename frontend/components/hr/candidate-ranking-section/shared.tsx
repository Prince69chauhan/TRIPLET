"use client"

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { jobService } from "@/lib/jobService"
import api from "@/lib/api"
import { ChatWindow } from "@/components/chat/chat-window"
import { AnalyticsSectionSkeleton } from "@/components/dashboard/section-skeleton"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useIsMobile } from "@/hooks/use-mobile"
import { markJobApplicationsSeen, subscribeToIndicatorChanges, syncJobApplicationIndicators } from "@/lib/activity-indicators"
import { getJobVisual } from "@/lib/job-visuals"
import {
  AlertCircle, BarChart3, Briefcase, Calendar, CheckCircle2, ChevronDown,
  ChevronUp, Clock3, Download, Eye, FileText, Loader2, MapPin, MessageSquare, RotateCcw,
  Search, SlidersHorizontal, Sparkles, Star, TrendingUp, Trophy, Users, XCircle,
  Wallet,
} from "lucide-react"
import { Slider } from "@/components/ui/slider"

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

const WINDOWED_CANDIDATE_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "340px",
} as const

export interface Job {
  id: string
  title: string
  vacancies?: number
  status?: string
  is_active?: boolean
  required_skills?: string[]
  department?: string | null
  employment_type?: string | null
  location?: string | null
  salary?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface JobCounts {
  posted: number
  active: number
  inactive: number
  past: number
  total: number
}

export interface JobStat {
  job_id: string
  title: string
  status: string
  total_applications: number
  passed_filter: number
  failed_filter: number
  avg_score: number
  top_score: number
  low_score: number
  shortlisted: number
  rejected: number
}

export interface RankedCandidate {
  rank: number
  application_id: string
  full_name: string
  cgpa: number | null
  passout_year?: number | null
  college?: string | null
  status: string
  passed_hard_filter: boolean | null
  filter_fail_reason: string | null
  base_score_m: number | null
  bonus_score_b: number | null
  final_score_d: number | null
  parsed_skills?: string[]
  bonus_breakdown: {
    project_level?: number
    elite_internship?: number
    skill_in_project?: number
    internship_duration?: number
    matched_skills?: string[]
    skills_matched?: string[]
    project_skills_matched?: string[]
    internship_skills_matched?: string[]
    [key: string]: unknown
  } | null
  applied_at?: string | null
}

export interface ScoringWeights {
  base: number
  skill: number
  elite: number
  project: number
  duration: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = { base: 100, skill: 100, elite: 100, project: 100, duration: 100 }

export function computeAdjustedScore(candidate: RankedCandidate, weights: ScoringWeights): number {
  const b = candidate.bonus_breakdown ?? {}
  const adjSkill    = ((b.skill_in_project    as number) ?? 0) * (weights.skill    / 100)
  const adjElite    = ((b.elite_internship    as number) ?? 0) * (weights.elite    / 100)
  const adjProject  = ((b.project_level       as number) ?? 0) * (weights.project  / 100)
  const adjDuration = ((b.internship_duration as number) ?? 0) * (weights.duration / 100)
  const adjBonus    = Math.min(30, adjSkill + adjElite + adjProject + adjDuration)
  const adjBase     = (candidate.base_score_m ?? 0) * (weights.base / 100)
  return Math.round(Math.min(100, Math.max(0, adjBase + adjBonus)) * 10) / 10
}

export function weightsAreDefault(w: ScoringWeights) {
  return (Object.keys(DEFAULT_WEIGHTS) as (keyof ScoringWeights)[]).every(k => w[k] === DEFAULT_WEIGHTS[k])
}

const pct = (v?: number | null) => typeof v === "number" && !Number.isNaN(v) ? Math.max(0, Math.min(100, Math.round(v * 10) / 10)) : 0
const fmtDate = (s?: string | null) => s && !Number.isNaN(new Date(s).getTime()) ? new Date(s).toLocaleDateString() : "-"
const scoreColor = (s: number) => s >= 70 ? "text-green-400" : s >= 40 ? "text-yellow-400" : "text-red-400"
const barColor = (s: number) => s >= 70 ? "bg-green-500" : s >= 40 ? "bg-yellow-500" : "bg-red-500"
const norm = (s: string) => s.trim().toLowerCase().replace(/[.\-_/(),]/g, "").replace(/\s+/g, " ")
const uniq = (skills: string[]) => [...new Set(skills.map(norm))].filter(Boolean)
const skillLabel = (s: string) => s.split(" ").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")

function matchedSkills(candidate: RankedCandidate, job?: Job | null) {
  const b = candidate.bonus_breakdown ?? {}
  const bonusMatched = uniq([
    ...(Array.isArray(b.matched_skills) ? b.matched_skills : []),
    ...(Array.isArray(b.skills_matched) ? b.skills_matched : []),
    ...(Array.isArray(b.project_skills_matched) ? b.project_skills_matched : []),
    ...(Array.isArray(b.internship_skills_matched) ? b.internship_skills_matched : []),
  ].filter((item): item is string => typeof item === "string"))

  if (bonusMatched.length > 0 || !job?.required_skills?.length) {
    return bonusMatched
  }

  const parsedSkills = uniq(Array.isArray(candidate.parsed_skills) ? candidate.parsed_skills : [])
  const required = uniq(job.required_skills)
  return required.filter(skill => parsedSkills.includes(skill))
}

function aiExplanation(candidate: RankedCandidate, job: Job | null) {
  const required = uniq(job?.required_skills ?? [])
  const matched = matchedSkills(candidate, job)
  const missing = required.filter(skill => !matched.includes(skill))
  const b = candidate.bonus_breakdown ?? {}
  const strengths: string[] = []
  const evidence: string[] = []
  const gaps: string[] = []

  if (matched.length >= 3) strengths.push(`strong alignment with ${matched.slice(0, 3).map(skillLabel).join(", ")}`)
  else if (matched.length > 0) strengths.push(`matches core skills like ${matched.map(skillLabel).join(", ")}`)
  else if (pct(candidate.base_score_m) >= 55) strengths.push("good semantic alignment with the role")
  else gaps.push("limited alignment with the role requirements")

  if ((b.skill_in_project ?? 0) > 0) evidence.push("shows required skills in project work")
  if ((b.project_level ?? 0) >= 10) evidence.push("has advanced project depth")
  else if ((b.project_level ?? 0) >= 5) evidence.push("has mid-level project depth")
  if ((b.elite_internship ?? 0) > 0) evidence.push("brings a strong internship brand signal")
  if ((b.internship_duration ?? 0) >= 6) evidence.push("has sustained internship exposure")
  else if ((b.internship_duration ?? 0) > 0) evidence.push("has some internship exposure")

  if (missing.length > 0) gaps.push(`lighter coverage on ${missing.slice(0, 3).map(skillLabel).join(", ")}`)
  if (candidate.passed_hard_filter === false && candidate.filter_fail_reason) gaps.push(`did not clear the hard filter: ${candidate.filter_fail_reason}`)
  else if (candidate.passed_hard_filter === true) evidence.push("meets academic and rule-based filters")

  const lead = strengths[0] ?? "Shows a mixed fit for this role"
  const evidencePart = evidence.length ? ` Evidence: ${evidence.slice(0, 2).join(", ")}.` : ""
  const gapPart = gaps.length ? ` Watchouts: ${gaps.slice(0, 2).join(", ")}.` : ""
  return `${lead.charAt(0).toUpperCase() + lead.slice(1)}.${evidencePart}${gapPart} Score mix: base ${pct(candidate.base_score_m)}%, bonus ${pct(candidate.bonus_score_b)}%, final ${pct(candidate.final_score_d)}%.`
}

const MiniBars = memo(function MiniBars({ data, height = 132 }: { data: { label: string; value: number; color: string }[]; height?: number }) {
  const max = Math.max(...data.map(item => item.value), 1)
  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-b from-secondary/20 to-transparent p-3">
      <div className="relative flex items-end gap-3" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map(mark => (
          <div
            key={mark}
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-border/40"
            style={{ bottom: `${mark * (height - 24)}px` }}
          />
        ))}
        {data.map(item => (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11px] font-medium text-foreground/80">{item.value}</span>
            <div className="w-full rounded-t-md bg-secondary/70 p-[1px]">
              <div
                className={`w-full rounded-t-md ${item.color} shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-all`}
                style={{ height: `${(item.value / max) * (height - 24)}px`, minHeight: item.value > 0 ? 6 : 0 }}
              />
            </div>
            <span className="text-center text-[11px] leading-tight text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

const Donut = memo(function Donut({ pass, fail }: { pass: number; fail: number }) {
  const total = pass + fail || 1
  const r = 40
  const circ = 2 * Math.PI * r
  const arc = (pass / total) * circ
  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-b from-secondary/20 to-transparent p-3">
      <div className="flex items-center justify-center">
        <svg width={120} height={120} viewBox="0 0 120 120">
          <defs>
            <linearGradient id="passGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#1f2937" strokeWidth="14" />
          <circle cx="60" cy="60" r={r} fill="none" stroke="url(#passGradient)" strokeWidth="14" strokeDasharray={`${arc} ${circ - arc}`} strokeDashoffset={circ / 4} strokeLinecap="round" />
          <text x="60" y="54" textAnchor="middle" className="fill-foreground" fontSize="16" fontWeight="700">{Math.round((pass / total) * 100)}%</text>
          <text x="60" y="72" textAnchor="middle" fill="#9ca3af" fontSize="10">pass rate</text>
        </svg>
      </div>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />Passed {pass}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-400" />Failed {fail}</span>
      </div>
    </div>
  )
})

const WEIGHT_CONFIG = [
  { key: "base"     as const, label: "Semantic Match",  color: "text-primary"    },
  { key: "skill"    as const, label: "Skill in Project", color: "text-green-400"  },
  { key: "elite"    as const, label: "Elite Internship", color: "text-blue-400"   },
  { key: "project"  as const, label: "Project Level",   color: "text-violet-400" },
  { key: "duration" as const, label: "Intern Duration",  color: "text-cyan-400"   },
]

export const WeightTuner = memo(function WeightTuner({ weights, onChange, onReset }: {
  weights: ScoringWeights
  onChange: (key: keyof ScoringWeights, value: number) => void
  onReset: () => void
}) {
  const isDefault = weightsAreDefault(weights)
  return (
    <Card className="border-primary/20 bg-primary/3 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">Scoring Weights</span>
            {!isDefault && <Badge className="border-0 bg-primary/10 py-0 px-1.5 text-[10px] text-primary">Custom</Badge>}
          </div>
          {!isDefault && (
            <Button variant="outline" size="sm" onClick={onReset} className="h-7 gap-1 border-border/60 px-2 text-[11px] text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Adjust how each factor contributes to the displayed score. Applied locally — stored scores are not changed.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {WEIGHT_CONFIG.map(({ key, label, color }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-medium ${color}`}>{label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{weights[key]}%</span>
              </div>
              <Slider
                value={[weights[key]]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => onChange(key, v)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

export const MobileAccordionPanel = memo(function MobileAccordionPanel({
  value,
  title,
  children,
  defaultOpen = false,
}: {
  value: string
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const isMobile = useIsMobile()

  if (!isMobile) {
    return <>{children}</>
  }

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? value : undefined}
      className="rounded-xl border border-border/60 bg-card"
    >
      <AccordionItem value={value} className="border-b-0">
        <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-foreground hover:no-underline">
          {title}
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
})

export function resolveStatus(job: Job): "active" | "paused" | "removed" | "completed" | "unknown" {
  const raw = typeof job.status === "string" ? job.status.toLowerCase() : ""
  if (raw.includes("active")) return "active"
  if (raw.includes("paused")) return "paused"
  if (raw.includes("removed")) return "removed"
  if (raw.includes("completed")) return "completed"
  if (job.is_active === true) return "active"
  if (job.is_active === false) return "removed"
  return "unknown"
}

function getRankTone(rank: number) {
  if (rank === 1) return "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-300"
  if (rank === 2) return "bg-slate-400/15 text-slate-600 ring-1 ring-slate-400/25 dark:text-slate-200"
  if (rank === 3) return "bg-orange-500/15 text-orange-600 ring-1 ring-orange-500/25 dark:text-orange-300"
  return "bg-secondary/80 text-muted-foreground"
}

export function getJobTimestamp(job: Job) {
  const source = job.updated_at ?? job.created_at
  return source ? new Date(source).getTime() : 0
}

export function getPausedDays(job: Job) {
  if (resolveStatus(job) !== "paused") return 0
  const timestamp = getJobTimestamp(job)
  if (!timestamp) return 0
  return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)))
}

function compactLabel(value: string, max = 14) {
  const label = value.trim()
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

function buildFrequencyBars(values: Array<string | null | undefined>, options?: { fallbackLabel?: string; maxItems?: number }) {
  const palette = ["bg-primary", "bg-blue-500", "bg-cyan-500", "bg-emerald-500", "bg-violet-500"]
  const counts = new Map<string, number>()
  const fallbackLabel = options?.fallbackLabel ?? "Unspecified"
  const maxItems = options?.maxItems ?? 5

  values.forEach((value) => {
    const label = value?.trim() || fallbackLabel
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([label, value], index) => ({
      label: compactLabel(label),
      value,
      color: palette[index % palette.length],
    }))
}

const InsightChartCard = memo(function InsightChartCard({
  title,
  subtitle,
  icon: Icon,
  data,
  emptyText,
  footer,
}: {
  title: string
  subtitle: string
  icon: any
  data: { label: string; value: number; color: string }[]
  emptyText: string
  footer?: ReactNode
}) {
  return (
    <Card className="border-border/60 bg-card">
      <CardHeader className="pb-2.5">
        <CardTitle className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </span>
          <span>{title}</span>
        </CardTitle>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {data.length > 0 ? (
          <MiniBars data={data} height={144} />
        ) : (
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
            <p className="text-[12.5px] text-muted-foreground">{emptyText}</p>
          </div>
        )}
        {footer}
      </CardContent>
    </Card>
  )
})

export const FilteredJobAnalytics = memo(function FilteredJobAnalytics({
  jobs,
  jobStatsById,
  sortMode,
  salaryQuery,
}: {
  jobs: Job[]
  jobStatsById: Map<string, JobStat>
  sortMode: "latest" | "most_applied" | "least_applied" | "title_asc" | "title_desc" | "paused_longest"
  salaryQuery: string
}) {
  const isMobile = useIsMobile()
  const visibleApplicants = jobs.reduce((total, job) => total + (jobStatsById.get(job.id)?.total_applications ?? 0), 0)
  const jobsWithApplicants = jobs.filter(job => (jobStatsById.get(job.id)?.total_applications ?? 0) > 0).length
  const jobsWithNoApplicants = jobs.length - jobsWithApplicants
  const avgApplicantsPerJob = jobs.length > 0 ? Math.round((visibleApplicants / jobs.length) * 10) / 10 : 0

  const applicationOrder = [...jobs].sort((a, b) => {
    const applicationsA = jobStatsById.get(a.id)?.total_applications ?? 0
    const applicationsB = jobStatsById.get(b.id)?.total_applications ?? 0
    return sortMode === "least_applied"
      ? applicationsA - applicationsB || a.title.localeCompare(b.title)
      : applicationsB - applicationsA || a.title.localeCompare(b.title)
  })

  const applicationDemand = applicationOrder
    .slice(0, 5)
    .map((job, index) => ({
      label: compactLabel(job.title, 12),
      value: jobStatsById.get(job.id)?.total_applications ?? 0,
      color: ["bg-primary", "bg-blue-500", "bg-cyan-500", "bg-emerald-500", "bg-violet-500"][index] ?? "bg-primary",
    }))

  const applicantCoverage = [
    { label: "With Apps", value: jobsWithApplicants, color: "bg-primary" },
    { label: "No Apps", value: jobsWithNoApplicants, color: "bg-slate-500" },
  ]

  const typeMix = buildFrequencyBars(jobs.map(job => job.employment_type), { fallbackLabel: "No type" })
  const locationMix = buildFrequencyBars(jobs.map(job => job.location), { fallbackLabel: "No location" })
  const salaryMix = buildFrequencyBars(jobs.map(job => job.salary), { fallbackLabel: "No salary" })
  const pausedDuration = [...jobs]
    .filter(job => resolveStatus(job) === "paused")
    .sort((a, b) => getPausedDays(b) - getPausedDays(a))
    .slice(0, 5)
    .map((job, index) => ({
      label: compactLabel(job.title, 12),
      value: getPausedDays(job),
      color: ["bg-yellow-500", "bg-orange-500", "bg-amber-500", "bg-slate-500", "bg-primary"][index] ?? "bg-yellow-500",
    }))

  const body = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <InsightChartCard
        title={sortMode === "least_applied" ? "Least Applied Jobs" : "Application Demand"}
        subtitle="Live application volume across the current visible job set"
        icon={TrendingUp}
        data={applicationDemand}
        emptyText="No visible jobs yet to compare application demand."
        footer={
          <div className="rounded-xl border border-border/60 bg-secondary/20 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Applicants in scope</p>
            <p className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{visibleApplicants}</p>
          </div>
        }
      />
      <InsightChartCard
        title="Applicant Coverage"
        subtitle="Shows which filtered jobs already have applicants versus none applied"
        icon={Users}
        data={applicantCoverage}
        emptyText="Coverage analytics will appear once jobs are visible."
        footer={
          <div className="rounded-xl border border-border/60 bg-secondary/20 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Avg applicants / job</p>
            <p className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{avgApplicantsPerJob}</p>
          </div>
        }
      />
      <InsightChartCard
        title="Job Type Mix"
        subtitle="Distribution of employment types in the current filtered set"
        icon={Briefcase}
        data={typeMix}
        emptyText="Add job types to postings to unlock this mix."
      />
      <InsightChartCard
        title="Location Mix"
        subtitle="Top locations represented by the currently filtered job results"
        icon={MapPin}
        data={locationMix}
        emptyText="Location distribution will appear once locations are available."
      />
      <InsightChartCard
        title="Salary Mix"
        subtitle={salaryQuery ? `Filtered around salary matching "${salaryQuery}"` : "Top salary bands in the currently visible jobs"}
        icon={Wallet}
        data={salaryMix}
        emptyText="Salary analytics will appear once salary data is present."
      />
      <InsightChartCard
        title="Paused Longest"
        subtitle="Shows which paused jobs have been paused the longest"
        icon={Clock3}
        data={pausedDuration}
        emptyText="No paused jobs in the current filter set."
      />
    </div>
  )

  if (isMobile) {
    return (
      <MobileAccordionPanel value="live-filter-analytics" title="Live Filter Analytics" defaultOpen>
        {body}
      </MobileAccordionPanel>
    )
  }

  return <div className="space-y-3">{body}</div>
})

export const OverallAnalytics = memo(function OverallAnalytics({ jobs, counts }: { jobs: Job[]; counts: JobCounts | null }) {
  const isMobile = useIsMobile()
  const active = jobs.filter(job => resolveStatus(job) === "active").length
  const paused = jobs.filter(job => resolveStatus(job) === "paused").length
  const past = jobs.filter(job => {
    const status = resolveStatus(job)
    return status === "removed" || status === "completed"
  }).length
  const skillsMap = new Map<string, number>()
  jobs.forEach(job => uniq(job.required_skills ?? []).forEach(skill => skillsMap.set(skill, (skillsMap.get(skill) ?? 0) + 1)))
  const topSkills = [...skillsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, value], i) => ({
    label: skillLabel(label), value, color: ["bg-primary", "bg-blue-500", "bg-cyan-500", "bg-emerald-500"][i] ?? "bg-primary",
  }))

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className={isMobile ? "grid grid-cols-3 gap-2" : "grid grid-cols-1 gap-4 sm:grid-cols-3"}>
        {[
          { label: "Total Jobs", value: counts?.total ?? jobs.length, icon: Briefcase, box: "bg-primary/10", text: "text-primary" },
          { label: "Active Jobs", value: active, icon: CheckCircle2, box: "bg-green-500/10", text: "text-green-500" },
          { label: "Paused Jobs", value: paused, icon: TrendingUp, box: "bg-yellow-500/10", text: "text-yellow-500" },
        ].map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="border-border/60 bg-card transition-all duration-200 hover:border-border hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.32)]">
              <CardContent className={isMobile ? "flex flex-col items-start gap-2.5 p-3" : "flex items-center gap-4 p-5"}>
                <div className={`flex shrink-0 items-center justify-center ${isMobile ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-[13px]"} ${item.box}`}>
                  <Icon className={`${isMobile ? "h-4 w-4" : "h-5 w-5"} ${item.text}`} />
                </div>
                <div className="min-w-0">
                  <p className={`${isMobile ? "text-[20px]" : "text-[26px]"} font-bold leading-none tabular-nums tracking-tight text-foreground`}>{item.value}</p>
                  <p className={`${isMobile ? "mt-1 text-[10.5px] leading-tight" : "mt-1.5 text-[12px]"} font-medium text-muted-foreground`}>{item.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {isMobile ? (
        <div className="space-y-2.5">
          <MobileAccordionPanel value="skills" title="Most Requested Skills" defaultOpen>
            {topSkills.length ? <MiniBars data={topSkills} height={148} /> : <p className="text-[13px] text-muted-foreground">Post jobs with required skills to unlock demand analytics.</p>}
          </MobileAccordionPanel>
          <MobileAccordionPanel value="guide" title="How to use ranking">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">Select any posted job below to inspect candidate fit, shortlist top applicants, and export recruiter-ready reports.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Past jobs</p>
                  <p className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{past}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Skill themes</p>
                  <p className="mt-1 text-[18px] font-bold tabular-nums text-foreground">{topSkills.length}</p>
                </div>
              </div>
            </div>
          </MobileAccordionPanel>
        </div>
      ) : (
        <>
          <Card className="border-border/60 bg-card">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" /> Most Requested Skills</CardTitle></CardHeader>
            <CardContent className="px-6 pb-6">
              {topSkills.length ? <MiniBars data={topSkills} height={148} /> : <p className="text-[13px] text-muted-foreground">Post jobs with required skills to unlock demand analytics.</p>}
            </CardContent>
          </Card>
          <Card className="border-border/60 border-l-[3px] border-l-primary bg-gradient-to-r from-primary/[0.04] to-transparent">
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">Select any posted job below to inspect candidate fit, shortlist top applicants, and export recruiter-ready reports.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Past jobs</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-foreground">{past}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Skill themes</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-foreground">{topSkills.length}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Active now</p>
                  <p className="mt-1 text-[20px] font-bold tabular-nums text-foreground">{active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
})

export const JobAnalytics = memo(function JobAnalytics({
  candidates,
  totalCandidates,
  jobStat,
}: {
  candidates: RankedCandidate[]
  totalCandidates?: number
  jobStat?: JobStat | null
}) {
  const isMobile = useIsMobile()
  const derivedTotal = candidates.length
  const derivedPassed = candidates.filter(c => c.passed_hard_filter).length
  const scores = candidates.map(c => pct(c.final_score_d))
  const total = totalCandidates ?? derivedTotal
  const passed = jobStat?.passed_filter ?? derivedPassed
  const failed = jobStat?.failed_filter ?? Math.max(0, total - passed)
  const avg = jobStat ? Math.round(jobStat.avg_score || 0) : (derivedTotal ? Math.round(scores.reduce((a, b) => a + b, 0) / derivedTotal) : 0)
  const top = jobStat ? Math.round(jobStat.top_score || 0) : (derivedTotal ? Math.max(...scores) : 0)
  const low = jobStat ? Math.round(jobStat.low_score || 0) : (derivedTotal ? Math.min(...scores) : 0)
  const totals = candidates.reduce((acc, c) => {
    const b = c.bonus_breakdown ?? {}
    acc.skill += (b.skill_in_project as number) ?? 0
    acc.intern += (b.elite_internship as number) ?? 0
    acc.project += (b.project_level as number) ?? 0
    acc.duration += (b.internship_duration as number) ?? 0
    return acc
  }, { skill: 0, intern: 0, project: 0, duration: 0 })
  const scoreDistribution = [
    { label: "0-25", value: scores.filter(s => s <= 25).length, color: "bg-red-500" },
    { label: "26-50", value: scores.filter(s => s > 25 && s <= 50).length, color: "bg-orange-500" },
    { label: "51-75", value: scores.filter(s => s > 50 && s <= 75).length, color: "bg-yellow-500" },
    { label: "76-100", value: scores.filter(s => s > 75).length, color: "bg-green-500" },
  ]
  const scoreRange = [
    { label: "Min", value: low, color: "bg-red-500" },
    { label: "Avg", value: avg, color: "bg-yellow-500" },
    { label: "Max", value: top, color: "bg-green-500" },
  ]
  const bonusBreakdown = [
    { label: "Skill", value: Math.round(totals.skill), color: "bg-primary" },
    { label: "Elite", value: Math.round(totals.intern), color: "bg-blue-500" },
    { label: "Project", value: Math.round(totals.project), color: "bg-violet-500" },
    { label: "Duration", value: Math.round(totals.duration), color: "bg-cyan-500" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Total Applicants", value: total, icon: Users, color: "text-primary", bg: "bg-primary/10" },
          { label: "Avg AI Score", value: `${avg}%`, icon: TrendingUp, color: "text-yellow-500", bg: "bg-yellow-500/10" },
          { label: "Top Score", value: `${top}%`, icon: Trophy, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "Low Score", value: `${low}%`, icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
          { label: "Filter Pass", value: `${passed}/${total}`, icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500/10" },
        ].map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="border-border/60 bg-card transition-all duration-200 hover:border-border hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)]">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${item.bg}`}>
                  <Icon className={`h-5 w-5 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[22px] font-bold leading-none tabular-nums tracking-tight ${item.color}`}>{item.value}</p>
                  <p className="mt-1.5 text-[11.5px] font-medium text-muted-foreground">{item.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {isMobile ? (
        <div className="space-y-3">
          <MobileAccordionPanel value="score-range" title="Score Range" defaultOpen>
            <MiniBars data={scoreRange} />
          </MobileAccordionPanel>
          <MobileAccordionPanel value="score-dist" title="Score Distribution">
            <MiniBars data={scoreDistribution} />
          </MobileAccordionPanel>
          <MobileAccordionPanel value="hard-filter" title="Hard Filter Result">
            <div className="flex flex-col items-center gap-2"><Donut pass={passed} fail={failed} /></div>
          </MobileAccordionPanel>
          <MobileAccordionPanel value="bonus-breakdown" title="Bonus Breakdown">
            <MiniBars data={bonusBreakdown} />
          </MobileAccordionPanel>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Score Range</CardTitle></CardHeader><CardContent className="px-4 pb-4"><MiniBars data={scoreRange} /></CardContent></Card>
          <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Score Distribution</CardTitle></CardHeader><CardContent className="px-4 pb-4"><MiniBars data={scoreDistribution} /></CardContent></Card>
          <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Hard Filter Result</CardTitle></CardHeader><CardContent className="flex flex-col items-center gap-2 pb-4"><Donut pass={passed} fail={failed} /></CardContent></Card>
          <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Bonus Breakdown</CardTitle></CardHeader><CardContent className="px-4 pb-4"><MiniBars data={bonusBreakdown} /></CardContent></Card>
        </div>
      )}
    </div>
  )
})

export const CandidateCard = memo(function CandidateCard({ candidate, index, recommended, job, onShortlist, onMessage, adjustedScore }: { candidate: RankedCandidate; index: number; recommended: boolean; job: Job | null; onShortlist: (c: RankedCandidate) => void; onMessage: (c: RankedCandidate) => void; adjustedScore: number }) {
  const [open, setOpen] = useState(false)
  const [barMode, setBarMode] = useState<"rse" | "score" | "hybrid">("rse")
  const isMobile = useIsMobile()
  const displayedRank = candidate.rank || index + 1
  const matched = matchedSkills(candidate, job)
  const missing = uniq(job?.required_skills ?? []).filter(skill => !matched.includes(skill))
  const explain = aiExplanation(candidate, job)
  const final = adjustedScore
  const base = pct(candidate.base_score_m)
  const bonus = pct(candidate.bonus_score_b)
  const isWeighted = adjustedScore !== pct(candidate.final_score_d)
  const b = candidate.bonus_breakdown ?? {}

  const requiredCount = uniq(job?.required_skills ?? []).length
  const skillMatchPct = requiredCount > 0
    ? Math.min(100, Math.round((matched.length / requiredCount) * 100))
    : (b.skill_in_project ?? 0) > 0 ? 70 : 40
  const resumePct = Math.min(100, Math.round((base * 0.75) + (final * 0.25)))
  const expRaw = ((b.project_level ?? 0) * 6) + ((b.internship_duration ?? 0) * 6) + ((b.elite_internship ?? 0) * 2)
  const experiencePct = Math.min(100, Math.max(0, Math.round(expRaw)))
  const filterPct = candidate.passed_hard_filter === true ? 100 : candidate.passed_hard_filter === false ? 20 : 55
  const consistencyPct = Math.max(0, Math.min(100, Math.round((base + final) / 2)))

  const barSets: Record<"rse" | "score" | "hybrid", Array<{ label: string; value: number }>> = {
    rse: [
      { label: "Resume", value: resumePct },
      { label: "Skills", value: skillMatchPct },
      { label: "Experience", value: experiencePct },
    ],
    score: [
      { label: "Base", value: base },
      { label: "Bonus", value: bonus },
      { label: "Final", value: final },
    ],
    hybrid: [
      { label: "Skill Match", value: skillMatchPct },
      { label: "Filter", value: filterPct },
      { label: "Consistency", value: consistencyPct },
    ],
  }

  return (
    <>
      <Card
        className={`bg-card border-border/60 transition-all duration-200 hover:border-primary/25 hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.35)] ${recommended ? "border-primary/30 ring-1 ring-primary/15" : ""}`}
        style={WINDOWED_CANDIDATE_STYLE}
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-center">

            {/* Rank + Avatar + Name */}
            <div className="flex min-w-0 items-center gap-3 xl:w-[240px] xl:shrink-0">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[12.5px] font-bold tabular-nums ${getRankTone(displayedRank)}`}>
                {displayedRank}
              </div>
              <Avatar className="h-10 w-10 shrink-0 border border-border/60">
                <AvatarFallback className="bg-primary/10 text-[12.5px] font-bold text-primary">
                  {candidate.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">{candidate.full_name}</span>
                  {recommended && <Badge className="border-0 bg-primary/12 py-0 px-1.5 text-[10px] font-semibold text-primary">Recommended</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  CGPA <span className="font-semibold text-foreground/80 tabular-nums">{candidate.cgpa ?? "-"}</span>
                </p>
              </div>
            </div>

            {/* AI Score */}
            <div className="flex items-center gap-2.5 xl:w-[110px] xl:shrink-0">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] ${
                final >= 70 ? "bg-green-500/10 text-green-500" :
                final >= 40 ? "bg-yellow-500/10 text-yellow-500" :
                "bg-red-500/10 text-red-500"
              }`}>
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/80">{isWeighted ? "Weighted" : "AI Score"}</p>
                <p className={`text-[22px] font-bold leading-tight tabular-nums ${scoreColor(final)}`}>{final}%</p>
              </div>
            </div>

            {/* Assessment Bars */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="mb-2 inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-secondary/40 p-0.5">
                {[
                  { key: "rse" as const, label: "RSE" },
                  { key: "score" as const, label: "Score" },
                  { key: "hybrid" as const, label: "Hybrid" },
                ].map(mode => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setBarMode(mode.key)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-all ${
                      barMode === mode.key
                        ? "bg-primary/15 text-primary shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_25%,transparent)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {barSets[barMode].map(row => (
                <div key={row.label} className="flex items-center gap-2.5">
                  <span className="w-[68px] shrink-0 text-[10.5px] font-medium text-muted-foreground">{row.label}</span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary/60">
                    <div className={`h-full rounded-full ${barColor(row.value)} transition-all duration-500`} style={{ width: `${row.value}%` }} />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground/80">{row.value}%</span>
                </div>
              ))}
            </div>

            {/* AI blurb — 2xl only */}
            <div className="hidden min-w-0 flex-1 2xl:block">
              <p className="line-clamp-3 text-[11px] italic text-muted-foreground">&ldquo;{explain}&rdquo;</p>
            </div>

            {/* Status + Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <Badge className={`border-0 text-[10.5px] font-semibold uppercase tracking-[0.04em] py-0.5 px-2 ${candidate.status === "rejected" ? "bg-red-500/10 text-red-500" : candidate.status === "shortlisted" ? "bg-primary/12 text-primary" : candidate.status === "scored" ? "bg-green-500/10 text-green-500" : "bg-secondary/70 text-muted-foreground"}`}>
                {candidate.status}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-8 w-8 border-border/60 p-0 text-muted-foreground hover:text-foreground" title="View details">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={() => onShortlist(candidate)} className="h-8 border border-primary/20 bg-primary/10 px-3 text-[11.5px] font-semibold text-primary hover:bg-primary/20">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Shortlist
              </Button>
            </div>
          </div>
          {candidate.passed_hard_filter === false && candidate.filter_fail_reason && (
            <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-red-500/15 bg-red-500/8 px-3 py-2 text-[11.5px] text-red-500 dark:text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words leading-relaxed">{candidate.filter_fail_reason}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto border-border/60 bg-card p-0 sm:w-full sm:max-w-3xl lg:max-w-4xl">

          {/* ── Panel Header ── */}
          <DialogHeader className="sticky top-0 z-10 border-b border-border/50 bg-card/97 px-5 py-4 backdrop-blur-xl">
            <div className="flex items-center gap-3 pr-6">
              <Avatar className="h-10 w-10 shrink-0 border border-border/60">
                <AvatarFallback className="bg-primary/10 text-[13px] font-semibold text-primary">
                  {candidate.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                    {candidate.full_name}
                  </DialogTitle>
                  {recommended && (
                    <Badge className="border-0 bg-primary/10 py-0 px-2 text-[10px] font-semibold text-primary">
                      Recommended
                    </Badge>
                  )}
                </div>
                <DialogDescription className="mt-0.5 text-[12px] text-muted-foreground">
                  {candidate.college || "Candidate"}
                </DialogDescription>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70 px-0">
              Applied on {fmtDate(candidate.applied_at)}
            </p>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-5 pt-4">

            {/* ── AI Assessment ── */}
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[12.5px] font-semibold text-foreground">AI Assessment</span>
              </div>
              <p className="text-[12px] italic leading-relaxed text-muted-foreground">
                &ldquo;{explain}&rdquo;
              </p>
            </div>

            {/* ── Assessment Bars + Bonus Signals ── */}
            {isMobile && (
              <Accordion type="multiple" defaultValue={["bars", "skills"]} className="rounded-xl border border-border/50 bg-secondary/10">
                <AccordionItem value="bars" className="border-border/50 px-4">
                  <AccordionTrigger className="py-3 text-[12.5px] font-semibold text-foreground hover:no-underline">
                    Assessment Bars and Bonus Signals
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12.5px] font-semibold text-foreground">Assessment Bars</p>
                        <div className="flex items-center gap-1">
                          {[{ key: "rse" as const, label: "RSE" }, { key: "score" as const, label: "Score" }, { key: "hybrid" as const, label: "Hybrid" }].map(mode => (
                            <button
                              key={mode.key}
                              type="button"
                              onClick={() => setBarMode(mode.key)}
                              className={`rounded-[6px] px-2 py-0.5 text-[10px] border transition-colors ${
                                barMode === mode.key
                                  ? "border-primary/30 bg-primary/12 text-primary"
                                  : "border-border/60 bg-secondary/60 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {barSets[barMode].map(row => (
                        <div key={row.label} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{row.label}</span>
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary/70">
                            <div className={`h-full ${barColor(row.value)} transition-all`} style={{ width: `${row.value}%` }} />
                          </div>
                          <span className={`w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums ${scoreColor(row.value)}`}>
                            {row.value}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                      <p className="mb-2.5 text-[12.5px] font-semibold text-foreground">Bonus Signals</p>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          ["Skill/Project",    (b.skill_in_project    as number) ?? 0, "bg-primary"],
                          ["Elite Internship", (b.elite_internship    as number) ?? 0, "bg-blue-500"],
                          ["Project Level",    (b.project_level       as number) ?? 0, "bg-violet-500"],
                          ["Intern Duration",  (b.internship_duration as number) ?? 0, "bg-cyan-500"],
                        ].map(([label, value, color]) => (
                          <div
                            key={label as string}
                            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 rounded-[8px] bg-secondary/50 px-3 py-2.5"
                          >
                            <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color as string}`} />
                            <span className="min-w-0 break-normal text-[11.5px] leading-snug text-muted-foreground [overflow-wrap:normal] [word-break:keep-all]">
                              {label as string}
                            </span>
                            <span className="col-start-2 inline-flex w-fit items-center rounded-md bg-background/40 px-1.5 py-0.5 text-[13px] font-semibold text-foreground tabular-nums">
                              +{value as number}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="skills" className="border-border/50 px-4">
                  <AccordionTrigger className="py-3 text-[12.5px] font-semibold text-foreground hover:no-underline">
                    Matched and Missing Skills
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                      <p className="mb-2 text-[12.5px] font-semibold text-foreground">Matched Skills</p>
                      {matched.length
                        ? <div className="flex flex-wrap gap-1.5">{matched.map(skill => <Badge key={skill} className="border-0 bg-green-500/10 py-0 px-2 text-[11px] text-green-400">{skillLabel(skill)}</Badge>)}</div>
                        : <p className="text-[11.5px] text-muted-foreground">No explicit skill match signal extracted yet.</p>
                      }
                    </div>
                    <div className="rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                      <p className="mb-2 text-[12.5px] font-semibold text-foreground">Missing Target Skills</p>
                      {missing.length
                        ? <div className="flex flex-wrap gap-1.5">{missing.map(skill => <Badge key={skill} className="border-0 bg-red-500/10 py-0 px-2 text-[11px] text-red-400">{skillLabel(skill)}</Badge>)}</div>
                        : <p className="text-[11.5px] text-muted-foreground">No major gaps detected against listed job skills.</p>
                      }
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="meta" className="border-b-0 px-4">
                  <AccordionTrigger className="py-3 text-[12.5px] font-semibold text-foreground hover:no-underline">
                    Candidate Details
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { Icon: Briefcase, label: "CGPA",         value: candidate.cgpa ?? "-" },
                        { Icon: Calendar,  label: "Applied",      value: fmtDate(candidate.applied_at) },
                        { Icon: FileText,  label: "Passout Year", value: candidate.passout_year ?? "-" },
                        { Icon: Sparkles,  label: "Hard Filter",  value: candidate.passed_hard_filter === null ? "Pending" : candidate.passed_hard_filter ? "Passed" : "Failed" },
                      ].map(({ Icon, label, value }) => (
                        <div key={label} className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[10.5px] text-muted-foreground">{label}</p>
                            <p className="text-[13px] font-semibold text-foreground truncate">{String(value)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2">

              {/* Assessment Bars */}
              <div className="space-y-3 rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-foreground">Assessment Bars</p>
                  <div className="flex items-center gap-1">
                    {[{ key: "rse" as const, label: "RSE" }, { key: "score" as const, label: "Score" }, { key: "hybrid" as const, label: "Hybrid" }].map(mode => (
                      <button
                        key={mode.key}
                        type="button"
                        onClick={() => setBarMode(mode.key)}
                        className={`rounded-[6px] px-2 py-0.5 text-[10px] border transition-colors ${
                          barMode === mode.key
                            ? "border-primary/30 bg-primary/12 text-primary"
                            : "border-border/60 bg-secondary/60 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                {barSets[barMode].map(row => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{row.label}</span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary/70">
                      <div className={`h-full ${barColor(row.value)} transition-all`} style={{ width: `${row.value}%` }} />
                    </div>
                    <span className={`w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums ${scoreColor(row.value)}`}>
                      {row.value}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Bonus Signals */}
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                <p className="mb-2.5 text-[12.5px] font-semibold text-foreground">Bonus Signals</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    ["Skill/Project",    (b.skill_in_project    as number) ?? 0, "bg-primary"],
                    ["Elite Internship", (b.elite_internship    as number) ?? 0, "bg-blue-500"],
                    ["Project Level",    (b.project_level       as number) ?? 0, "bg-violet-500"],
                    ["Intern Duration",  (b.internship_duration as number) ?? 0, "bg-cyan-500"],
                  ].map(([label, value, color]) => (
                    <div
                      key={label as string}
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 rounded-[8px] bg-secondary/50 px-3 py-2.5"
                    >
                      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color as string}`} />
                      <span className="min-w-0 break-normal text-[11.5px] leading-snug text-muted-foreground [overflow-wrap:normal] [word-break:keep-all]">
                        {label as string}
                      </span>
                      <span className="col-start-2 inline-flex w-fit items-center rounded-md bg-background/40 px-1.5 py-0.5 text-[13px] font-semibold text-foreground tabular-nums">
                        +{value as number}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Matched + Missing Skills ── */}
            <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                <p className="mb-2 text-[12.5px] font-semibold text-foreground">Matched Skills</p>
                {matched.length
                  ? <div className="flex flex-wrap gap-1.5">{matched.map(skill => <Badge key={skill} className="border-0 bg-green-500/10 py-0 px-2 text-[11px] text-green-400">{skillLabel(skill)}</Badge>)}</div>
                  : <p className="text-[11.5px] text-muted-foreground">No explicit skill match signal extracted yet.</p>
                }
              </div>
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-3.5">
                <p className="mb-2 text-[12.5px] font-semibold text-foreground">Missing Target Skills</p>
                {missing.length
                  ? <div className="flex flex-wrap gap-1.5">{missing.map(skill => <Badge key={skill} className="border-0 bg-red-500/10 py-0 px-2 text-[11px] text-red-400">{skillLabel(skill)}</Badge>)}</div>
                  : <p className="text-[11.5px] text-muted-foreground">No major gaps detected against listed job skills.</p>
                }
              </div>
            </div>

            {/* ── Meta Info ── */}
            <div className="hidden grid-cols-2 gap-2 sm:grid">
              {[
                { Icon: Briefcase, label: "CGPA",         value: candidate.cgpa ?? "-" },
                { Icon: Calendar,  label: "Applied",      value: fmtDate(candidate.applied_at) },
                { Icon: FileText,  label: "Passout Year", value: candidate.passout_year ?? "-" },
                { Icon: Sparkles,  label: "Hard Filter",  value: candidate.passed_hard_filter === null ? "Pending" : candidate.passed_hard_filter ? "Passed" : "Failed" },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10.5px] text-muted-foreground">{label}</p>
                    <p className="text-[13px] font-semibold text-foreground truncate">{String(value)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Filter Fail Reason ── */}
            {candidate.filter_fail_reason && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/8 p-3 text-[12px] text-red-400">
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{candidate.filter_fail_reason}</span>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-2 border-t border-border/50 pt-3">
              <Button
                onClick={() => { onShortlist(candidate); setOpen(false) }}
                className="flex-1 bg-primary text-[13px] text-primary-foreground h-9"
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Shortlist
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-border/60 text-[13px] text-foreground hover:bg-secondary h-9"
                onClick={() => { onMessage(candidate); setOpen(false) }}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Message
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})

export function exportCSV(candidates: RankedCandidate[], jobTitle: string) {
  const esc = (v: string | number) => `"${String(v).replaceAll("\"", "\"\"")}"`
  const rows = [["Rank", "Name", "CGPA", "Final Score", "Base Score", "Bonus Score", "Status", "Hard Filter", "Fail Reason", "Applied At"], ...candidates.map(c => [c.rank, c.full_name, c.cgpa ?? "", pct(c.final_score_d), pct(c.base_score_m), pct(c.bonus_score_b), c.status, c.passed_hard_filter ? "Passed" : c.passed_hard_filter === false ? "Failed" : "Pending", c.filter_fail_reason ?? "", fmtDate(c.applied_at)])]
  const blob = new Blob([rows.map(row => row.map(esc).join(",")).join("\n")], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${jobTitle.replace(/\s+/g, "_")}_candidates.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportPDF(candidates: RankedCandidate[], jobTitle: string) {
  const top = candidates.slice(0, 10)
  const html = `<html><head><title>Shortlist - ${jobTitle}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{color:#666;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb}td{padding:8px 12px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}.score{font-weight:bold;color:#059669}</style></head><body><h1>Shortlist - ${jobTitle}</h1><p>Generated on ${new Date().toLocaleDateString()} - Top ${top.length} candidates</p><table><tr><th>Rank</th><th>Name</th><th>CGPA</th><th>Final Score</th><th>Status</th></tr>${top.map(c => `<tr><td>#${c.rank}</td><td>${c.full_name}</td><td>${c.cgpa ?? "-"}</td><td class="score">${pct(c.final_score_d)}%</td><td>${c.status}</td></tr>`).join("")}</table></body></html>`
  const win = window.open("", "_blank")
  if (win) { win.document.write(html); win.document.close(); win.print() }
}

