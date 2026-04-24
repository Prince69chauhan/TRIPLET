"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { jobService } from "@/lib/jobService"
import api from "@/lib/api"
import { ChatWindow } from "@/components/chat/chat-window"
import { AnalyticsSectionSkeleton } from "@/components/dashboard/section-skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { markJobApplicationsSeen, subscribeToIndicatorChanges, syncJobApplicationIndicators } from "@/lib/activity-indicators"
import {
  AlertCircle, BarChart3, Briefcase, Calendar, CheckCircle2, ChevronDown,
  ChevronUp, Download, Eye, FileText, Loader2, MessageSquare, RotateCcw,
  Search, SlidersHorizontal, Sparkles, Star, TrendingUp, Trophy, Users, XCircle,
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

interface Job {
  id: string
  title: string
  vacancies?: number
  status?: string
  is_active?: boolean
  required_skills?: string[]
}

interface JobCounts {
  posted: number
  active: number
  inactive: number
  past: number
  total: number
}

interface RankedCandidate {
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

interface ScoringWeights {
  base: number
  skill: number
  elite: number
  project: number
  duration: number
}

const DEFAULT_WEIGHTS: ScoringWeights = { base: 100, skill: 100, elite: 100, project: 100, duration: 100 }

function computeAdjustedScore(candidate: RankedCandidate, weights: ScoringWeights): number {
  const b = candidate.bonus_breakdown ?? {}
  const adjSkill    = ((b.skill_in_project    as number) ?? 0) * (weights.skill    / 100)
  const adjElite    = ((b.elite_internship    as number) ?? 0) * (weights.elite    / 100)
  const adjProject  = ((b.project_level       as number) ?? 0) * (weights.project  / 100)
  const adjDuration = ((b.internship_duration as number) ?? 0) * (weights.duration / 100)
  const adjBonus    = Math.min(30, adjSkill + adjElite + adjProject + adjDuration)
  const adjBase     = (candidate.base_score_m ?? 0) * (weights.base / 100)
  return Math.round(Math.min(100, Math.max(0, adjBase + adjBonus)) * 10) / 10
}

function weightsAreDefault(w: ScoringWeights) {
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

const WeightTuner = memo(function WeightTuner({ weights, onChange, onReset }: {
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

function resolveStatus(job: Job): "active" | "paused" | "removed" | "completed" | "unknown" {
  const raw = typeof job.status === "string" ? job.status.toLowerCase() : ""
  if (raw.includes("active")) return "active"
  if (raw.includes("paused")) return "paused"
  if (raw.includes("removed")) return "removed"
  if (raw.includes("completed")) return "completed"
  if (job.is_active === true) return "active"
  if (job.is_active === false) return "removed"
  return "unknown"
}

const OverallAnalytics = memo(function OverallAnalytics({ jobs, counts }: { jobs: Job[]; counts: JobCounts | null }) {
  const fallbackActive = jobs.filter(job => resolveStatus(job) === "active").length
  const fallbackPaused = jobs.filter(job => resolveStatus(job) === "paused").length
  const fallbackPast = jobs.filter(job => {
    const status = resolveStatus(job)
    return status === "removed" || status === "completed"
  }).length

  const active = counts?.active ?? fallbackActive
  const paused = counts?.inactive ?? fallbackPaused
  const past = counts?.past ?? fallbackPast
  const skillsMap = new Map<string, number>()
  jobs.forEach(job => uniq(job.required_skills ?? []).forEach(skill => skillsMap.set(skill, (skillsMap.get(skill) ?? 0) + 1)))
  const topSkills = [...skillsMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, value], i) => ({
    label: skillLabel(label), value, color: ["bg-primary", "bg-blue-500", "bg-cyan-500", "bg-emerald-500"][i] ?? "bg-primary",
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Jobs", value: counts?.total ?? jobs.length, icon: Briefcase, box: "bg-primary/10", text: "text-primary" },
          { label: "Active Jobs", value: active, icon: CheckCircle2, box: "bg-green-500/10", text: "text-green-500" },
          { label: "Paused Jobs", value: paused, icon: TrendingUp, box: "bg-yellow-500/10", text: "text-yellow-500" },
        ].map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="border-border/60 bg-card transition-all duration-200 hover:border-border hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] dark:hover:shadow-[0_6px_24px_rgba(0,0,0,0.32)]">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] ${item.box}`}>
                  <Icon className={`h-5 w-5 ${item.text}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-foreground">{item.value}</p>
                  <p className="mt-1.5 text-[12px] font-medium text-muted-foreground">{item.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-primary" /> Job Status Distribution</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6"><MiniBars data={[{ label: "Active", value: active, color: "bg-green-500" }, { label: "Paused", value: paused, color: "bg-yellow-500" }, { label: "Past", value: past, color: "bg-gray-500" }]} height={148} /></CardContent>
        </Card>
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" /> Most Requested Skills</CardTitle></CardHeader>
          <CardContent className="px-6 pb-6">
            {topSkills.length ? <MiniBars data={topSkills} height={148} /> : <p className="text-[13px] text-muted-foreground">Post jobs with required skills to unlock demand analytics.</p>}
          </CardContent>
        </Card>
      </div>
      <Card className="border-border/60 border-l-[3px] border-l-primary bg-gradient-to-r from-primary/[0.04] to-transparent">
        <CardContent className="flex items-start gap-3 p-5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">Select any posted job below to inspect candidate fit, shortlist top applicants, and export recruiter-ready reports.</p>
        </CardContent>
      </Card>
    </div>
  )
})

const JobAnalytics = memo(function JobAnalytics({ candidates }: { candidates: RankedCandidate[] }) {
  const total = candidates.length
  const passed = candidates.filter(c => c.passed_hard_filter).length
  const failed = total - passed
  const scores = candidates.map(c => pct(c.final_score_d))
  const avg = total ? Math.round(scores.reduce((a, b) => a + b, 0) / total) : 0
  const top = total ? Math.max(...scores) : 0
  const totals = candidates.reduce((acc, c) => {
    const b = c.bonus_breakdown ?? {}
    acc.skill += (b.skill_in_project as number) ?? 0
    acc.intern += (b.elite_internship as number) ?? 0
    acc.project += (b.project_level as number) ?? 0
    acc.duration += (b.internship_duration as number) ?? 0
    return acc
  }, { skill: 0, intern: 0, project: 0, duration: 0 })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Applicants", value: total, icon: Users, color: "text-primary", bg: "bg-primary/10" },
          { label: "Avg AI Score", value: `${avg}%`, icon: TrendingUp, color: "text-yellow-500", bg: "bg-yellow-500/10" },
          { label: "Top Score", value: `${top}%`, icon: Trophy, color: "text-green-500", bg: "bg-green-500/10" },
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Score Distribution</CardTitle></CardHeader><CardContent className="px-4 pb-4"><MiniBars data={[{ label: "0-25", value: scores.filter(s => s <= 25).length, color: "bg-red-500" }, { label: "26-50", value: scores.filter(s => s > 25 && s <= 50).length, color: "bg-orange-500" }, { label: "51-75", value: scores.filter(s => s > 50 && s <= 75).length, color: "bg-yellow-500" }, { label: "76-100", value: scores.filter(s => s > 75).length, color: "bg-green-500" }]} /></CardContent></Card>
        <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Hard Filter Result</CardTitle></CardHeader><CardContent className="flex flex-col items-center gap-2 pb-4"><Donut pass={passed} fail={failed} /></CardContent></Card>
        <Card className="border-border/60 bg-card"><CardHeader className="pb-2"><CardTitle className="text-[13.5px] font-semibold text-foreground">Bonus Breakdown</CardTitle></CardHeader><CardContent className="px-4 pb-4"><MiniBars data={[{ label: "Skill", value: Math.round(totals.skill), color: "bg-primary" }, { label: "Elite", value: Math.round(totals.intern), color: "bg-blue-500" }, { label: "Project", value: Math.round(totals.project), color: "bg-violet-500" }, { label: "Duration", value: Math.round(totals.duration), color: "bg-cyan-500" }]} /></CardContent></Card>
      </div>
    </div>
  )
})

const CandidateCard = memo(function CandidateCard({ candidate, index, recommended, job, onShortlist, onMessage, adjustedScore }: { candidate: RankedCandidate; index: number; recommended: boolean; job: Job | null; onShortlist: (c: RankedCandidate) => void; onMessage: (c: RankedCandidate) => void; adjustedScore: number }) {
  const [open, setOpen] = useState(false)
  const [barMode, setBarMode] = useState<"rse" | "score" | "hybrid">("rse")
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
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">

            {/* Rank + Avatar + Name */}
            <div className="flex min-w-0 items-center gap-3 xl:w-[240px] xl:shrink-0">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[12.5px] font-bold tabular-nums ${recommended ? "bg-primary/15 text-primary ring-1 ring-primary/20" : "bg-secondary/80 text-muted-foreground"}`}>
                #{candidate.rank || index + 1}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="grid grid-cols-2 gap-2">
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

/* extracted to "@/components/hr/shortlist-dialog"
function ShortlistDialog({
  open,
  onClose,
  candidates,
  jobId,
  jobTitle,
  preselected,
  onCompleted,
}: {
  open: boolean
  onClose: () => void
  candidates: RankedCandidate[]
  jobId: string
  jobTitle: string
  preselected: RankedCandidate | null
  onCompleted: () => Promise<void> | void
}) {
  const sorted = [...candidates].sort((a, b) => (b.final_score_d ?? 0) - (a.final_score_d ?? 0))
  const [count, setCount] = useState(preselected ? 1 : 3)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setCount(preselected ? 1 : 3); setSending(false); setSent(false); setError(null) }, [preselected, open])
  const shortlisted = preselected ? [preselected] : sorted.slice(0, count)
  const rejected = preselected ? [] : sorted.slice(count)

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      if (preselected) {
        await jobService.shortlistCandidates(jobId, {
          application_ids: [preselected.application_id],
          reject_others: false,
        })
      } else {
        await jobService.shortlistCandidates(jobId, {
          top_n: count,
          reject_others: true,
        })
      }
      await onCompleted()
      setSending(false)
      setSent(true)
      window.setTimeout(() => { setSent(false); onClose() }, 2200)
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message ?? "Failed to send shortlist emails")
        : "Failed to send shortlist emails"
      setSending(false)
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground"><Star className="h-5 w-5 text-primary" />{preselected ? "Shortlist Candidate" : "Bulk Shortlist"}</DialogTitle>
          <DialogDescription>{preselected ? `Prepare shortlist email for ${preselected.full_name}` : `Select top N candidates for ${jobTitle}`}</DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="space-y-3 py-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-green-500" /><p className="font-medium text-foreground">Shortlist workflow completed</p><p className="text-sm text-muted-foreground">{shortlisted.length} candidate{shortlisted.length > 1 ? "s" : ""} prepared for outreach.</p></div>
        ) : (
          <div className="mt-2 space-y-5">
            {!preselected && <div className="space-y-2"><Label className="text-sm text-foreground">Number of candidates to shortlist</Label><div className="flex flex-wrap gap-2">{[3, 5, 10, 15, 20].map(n => <button key={n} onClick={() => setCount(Math.min(sorted.length || 1, n))} className={`rounded-lg border px-3 py-1.5 text-sm ${count === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-foreground hover:border-primary/50"}`}>Top {n}</button>)}<input type="number" min={1} max={Math.max(sorted.length, 1)} value={count} onChange={e => setCount(Math.min(Math.max(sorted.length, 1), Math.max(1, parseInt(e.target.value, 10) || 1)))} className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-sm text-foreground" placeholder="N" /></div></div>}
            <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium text-foreground"><ThumbsUp className="h-4 w-4 text-green-500" />Will receive congratulations ({shortlisted.length})</p><div className="max-h-40 space-y-1.5 overflow-y-auto">{shortlisted.map((c, i) => <div key={c.application_id} className="flex items-center justify-between rounded-lg bg-green-500/10 p-2 text-sm"><span className="text-foreground">#{i + 1} {c.full_name}</span><span className="font-medium text-green-400">{pct(c.final_score_d)}%</span></div>)}</div></div>
            {rejected.length > 0 && !preselected && <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><ThumbsDown className="h-4 w-4 text-red-400" />Will receive polite rejection ({rejected.length})</p><div className="max-h-32 space-y-1.5 overflow-y-auto">{rejected.slice(0, 5).map(c => <div key={c.application_id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-2 text-sm"><span className="text-muted-foreground">{c.full_name}</span><span className="text-muted-foreground">{pct(c.final_score_d)}%</span></div>)}{rejected.length > 5 && <p className="text-center text-xs text-muted-foreground">+{rejected.length - 5} more</p>}</div></div>}
            {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">{error}</p>}
            <div className="flex gap-3 border-t border-border pt-2"><Button variant="outline" onClick={onClose} className="flex-1 border-border text-foreground">Cancel</Button><Button onClick={handleSend} disabled={sending || shortlisted.length === 0} className="flex-1 bg-primary text-primary-foreground">{sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Mail className="mr-2 h-4 w-4" /> Send Emails</>}</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

*/
function exportCSV(candidates: RankedCandidate[], jobTitle: string) {
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

function exportPDF(candidates: RankedCandidate[], jobTitle: string) {
  const top = candidates.slice(0, 10)
  const html = `<html><head><title>Shortlist - ${jobTitle}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{color:#666;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f4f6;padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb}td{padding:8px 12px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}.score{font-weight:bold;color:#059669}</style></head><body><h1>Shortlist - ${jobTitle}</h1><p>Generated on ${new Date().toLocaleDateString()} - Top ${top.length} candidates</p><table><tr><th>Rank</th><th>Name</th><th>CGPA</th><th>Final Score</th><th>Status</th></tr>${top.map(c => `<tr><td>#${c.rank}</td><td>${c.full_name}</td><td>${c.cgpa ?? "-"}</td><td class="score">${pct(c.final_score_d)}%</td><td>${c.status}</td></tr>`).join("")}</table></body></html>`
  const win = window.open("", "_blank")
  if (win) { win.document.write(html); win.document.close(); win.print() }
}

export function CandidateRankingSection() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [jobs, setJobs] = useState<Job[]>([])
  const [counts, setCounts] = useState<JobCounts | null>(null)
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
  const selectedJobIdFromUrl = searchParams.get("rankingJob")
  const debouncedJobSearch = useDebouncedValue(jobSearch, 250)
  const debouncedCandidateSearch = useDebouncedValue(candSearch, 250)
  const rankingPageSize = 25

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

  const filteredJobs = useMemo(() => {
    const query = debouncedJobSearch.trim().toLowerCase()
    return !query ? jobs : jobs.filter(job => job.title.toLowerCase().includes(query))
  }, [debouncedJobSearch, jobs])
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
      <div className="space-y-6">
        <AnalyticsDashboard />
        <OverallAnalytics jobs={jobs} counts={counts} />
        <Card className="border-border/60 bg-card">
          <CardContent className="space-y-4 p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={jobSearch} onChange={e => setJobSearch(e.target.value)} placeholder="Search job by title..." className="h-10 border-border/60 bg-input pl-9 text-[13.5px] text-foreground" />
            </div>
            {filteredJobs.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/60">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-[13.5px] font-semibold text-foreground">No jobs found</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">Try adjusting your search.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredJobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => selectJob(job)}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:bg-secondary/20 dark:hover:bg-secondary/40 dark:hover:shadow-[0_6px_20px_rgba(0,0,0,0.28)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {unseenApplicationJobIds.has(job.id) && <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />}
                          <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">{job.title}</p>
                        </div>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{job.required_skills?.length ? `${job.required_skills.length} target skills defined` : "Click to view candidate ranking"}</p>
                      </div>
                    </div>
                    <Badge className={`shrink-0 border-0 text-[10.5px] font-semibold uppercase tracking-[0.04em] ${job.status === "active" ? "bg-green-500/10 text-green-500" : job.status === "paused" ? "bg-yellow-500/10 text-yellow-500" : "bg-secondary text-muted-foreground"}`}>{job.status ?? "active"}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <FloatingBackButton
        onClick={handleBackToOverview}
        className="top-20 left-4 sm:left-6 sm:top-24 lg:left-[18rem]"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-14 sm:pt-0">
        <div className="sm:pl-24">
          <h2 className="text-[18px] font-bold tracking-[-0.02em] text-foreground">{selectedJob.title}</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground/80 tabular-nums">{totalCandidates}</span> applicants
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      {!loading && candidates.length > 0 && <JobAnalytics candidates={candidates} />}
      {weightsOpen && (
        <WeightTuner weights={weights} onChange={handleWeightChange} onReset={handleWeightReset} />
      )}
      <Card className="border-border/60 bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={candSearch} onChange={e => setCandSearch(e.target.value)} placeholder="Search candidates..." className="h-9 border-border/60 bg-input pl-9 text-[13px] text-foreground" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-36 border-border/60 bg-input text-[13px] text-foreground"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="scored">Scored</SelectItem><SelectItem value="shortlisted">Shortlisted</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
            </Select>
            <Select value={filterPassed} onValueChange={setFilterPassed}>
              <SelectTrigger className="h-9 w-36 border-border/60 bg-input text-[13px] text-foreground"><SelectValue placeholder="Filter" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Candidates</SelectItem><SelectItem value="passed">Passed Filter</SelectItem><SelectItem value="failed">Failed Filter</SelectItem></SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setSortOrder(cur => cur === "desc" ? "asc" : "desc")} className="h-9 border-border/60 text-[13px] font-medium text-muted-foreground hover:text-foreground">
              {sortOrder === "desc" ? <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> : <ChevronUp className="mr-1.5 h-3.5 w-3.5" />}
              {sortOrder === "desc" ? "Highest First" : "Lowest First"}
            </Button>
            <p className="ml-auto text-[11.5px] text-muted-foreground">
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
        <div className="space-y-3">
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
