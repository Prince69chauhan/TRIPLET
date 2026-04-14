"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { jobService } from "@/lib/jobService"
import { AnalyticsSectionSkeleton } from "@/components/dashboard/section-skeleton"
import {
  TrendingUp, Users, Briefcase, Trophy,
  BarChart3, PieChart as PieIcon, Activity,
  CheckCircle2
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────
interface JobStat {
  job_id             : string
  title              : string
  status             : string
  total_applications : number
  passed_filter      : number
  failed_filter      : number
  avg_score          : number
  top_score          : number
  low_score          : number
  shortlisted        : number
  rejected           : number
}

interface DailyApp {
  date         : string
  applications : number
}

interface AnalyticsData {
  jobStats    : JobStat[]
  dailyApps   : DailyApp[]
  counts      : {
    posted  : number
    active  : number
    inactive: number
    past    : number
    total   : number
  }
}

interface JobCounts {
  posted: number
  active: number
  inactive: number
  past: number
  total: number
}

// ── Color palette ─────────────────────────────────────────────
const COLORS = {
  primary  : "#10b981",
  blue     : "#3b82f6",
  yellow   : "#f59e0b",
  red      : "#ef4444",
  purple   : "#8b5cf6",
  cyan     : "#06b6d4",
  gray     : "#6b7280",
}

// ── Custom tooltip ────────────────────────────────────────────
const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      {label && <p className="text-muted-foreground mb-1 font-medium">{label}</p>}
      {payload.map((entry: any) => (
        <p key={`${entry.name}-${entry.value}`} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}
          {entry.name?.toLowerCase().includes("score") ? "%" : ""}
        </p>
      ))}
    </div>
  )
})

// ── KPI Card ──────────────────────────────────────────────────
const KpiCard = memo(function KpiCard({
  title, value, sub, icon: Icon, color, trend
}: {
  title: string
  value: string | number
  sub?: string
  icon: any
  color: string
  trend?: { value: number; label: string }
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            {trend && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${trend.value >= 0 ? "text-green-400" : "text-red-400"}`}>
                <TrendingUp className="h-3 w-3" />
                {trend.value >= 0 ? "+" : ""}{trend.value} {trend.label}
              </div>
            )}
          </div>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}20` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

// ── Main component ────────────────────────────────────────────
export function AnalyticsDashboard() {
  const [data, setData]       = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedScoreJobId, setSelectedScoreJobId] = useState<string>("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [counts, statsRes, dailyRes] = await Promise.all([
        jobService.getJobCounts(),
        jobService.getJobAnalytics(),
        jobService.getDailyApplications(),
      ])
      setData({
        counts: counts as JobCounts,
        jobStats : Array.isArray(statsRes) ? statsRes : [],
        dailyApps: Array.isArray(dailyRes) ? dailyRes : [],
      })
    } catch {
      setData({ counts: { posted:0, active:0, inactive:0, past:0, total:0 }, jobStats:[], dailyApps:[] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const jobStats = data?.jobStats ?? []
  const dailyApps = data?.dailyApps ?? []
  const counts = data?.counts ?? { posted: 0, active: 0, inactive: 0, past: 0, total: 0 }
  const selectableScoreJobs = useMemo(() => jobStats.filter(job =>
    job.total_applications > 0 || job.avg_score > 0 || job.top_score > 0 || job.low_score > 0
  ), [jobStats])
  const selectedScoreJob = selectableScoreJobs.find(job => job.job_id === selectedScoreJobId) ?? selectableScoreJobs[0] ?? null

  useEffect(() => {
    if (selectableScoreJobs.length === 0) {
      if (selectedScoreJobId) setSelectedScoreJobId("")
      return
    }
    if (!selectedScoreJobId || !selectableScoreJobs.some(job => job.job_id === selectedScoreJobId)) {
      setSelectedScoreJobId(selectableScoreJobs[0].job_id)
    }
  }, [selectableScoreJobs, selectedScoreJobId])

  if (loading) return <AnalyticsSectionSkeleton />

  // Derived metrics
  const totalApps   = jobStats.reduce((s, j) => s + j.total_applications, 0)
  const totalPassed = jobStats.reduce((s, j) => s + j.passed_filter, 0)
  const totalFailed = jobStats.reduce((s, j) => s + j.failed_filter, 0)
  const avgScore    = jobStats.length
    ? Math.round(jobStats.reduce((s, j) => s + (j.avg_score || 0), 0) / jobStats.length)
    : 0
  const passRate    = totalApps > 0 ? Math.round((totalPassed / totalApps) * 100) : 0

  // Score distribution across all jobs
  const scoreDist = [
    { range: "0–25",   count: jobStats.filter(j => j.avg_score <= 25).length,               fill: COLORS.red    },
    { range: "26–50",  count: jobStats.filter(j => j.avg_score > 25 && j.avg_score <= 50).length, fill: COLORS.yellow },
    { range: "51–75",  count: jobStats.filter(j => j.avg_score > 50 && j.avg_score <= 75).length, fill: COLORS.blue   },
    { range: "76–100", count: jobStats.filter(j => j.avg_score > 75).length,                fill: COLORS.primary},
  ]

  // Job status pie
  const statusPie = [
    { name: "Active",   value: counts.active,   fill: COLORS.primary },
    { name: "Paused",   value: counts.inactive, fill: COLORS.yellow  },
    { name: "Past",     value: counts.past,     fill: COLORS.gray    },
  ].filter(d => d.value > 0)

  // Filter pass/fail pie
  const filterPie = [
    { name: "Passed", value: totalPassed, fill: COLORS.primary },
    { name: "Failed", value: totalFailed, fill: COLORS.red     },
  ].filter(d => d.value > 0)

  // Per-job bar data
  const jobBarData = jobStats.map(j => ({
    name       : j.title.length > 20 ? j.title.slice(0, 20) + "…" : j.title,
    Applications: j.total_applications,
    "Avg Score" : Math.round(j.avg_score || 0),
    Passed      : j.passed_filter,
    Failed      : j.failed_filter,
  }))

  // Daily apps area chart
  const areaData = [...dailyApps]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(d => ({
      date        : new Date(d.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      Applications: d.applications,
    }))

  // Radar — job performance
  const radarData = jobStats.map(j => ({
    job        : j.title.length > 15 ? j.title.slice(0, 15) + "…" : j.title,
    "Avg Score": Math.round(j.avg_score || 0),
    "Pass Rate": j.total_applications > 0
      ? Math.round((j.passed_filter / j.total_applications) * 100)
      : 0,
    Applications: j.total_applications * 10, // scaled for radar
  }))

  return (
    <div className="space-y-6">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Jobs Posted"
          value={counts.total}
          sub={`${counts.active} active`}
          icon={Briefcase}
          color={COLORS.primary}
        />
        <KpiCard
          title="Total Applications"
          value={totalApps}
          sub="across all jobs"
          icon={Users}
          color={COLORS.blue}
        />
        <KpiCard
          title="Avg AI Score"
          value={`${avgScore}%`}
          sub="across all candidates"
          icon={Trophy}
          color={COLORS.yellow}
        />
        <KpiCard
          title="Filter Pass Rate"
          value={`${passRate}%`}
          sub={`${totalPassed} passed, ${totalFailed} failed`}
          icon={CheckCircle2}
          color={COLORS.primary}
        />
      </div>

      {/* ── Daily Applications Area Chart ── */}
      {areaData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Application Activity (Last 14 Days)
            </CardTitle>
            <CardDescription>Daily application submissions across all job postings</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="Applications"
                  stroke={COLORS.primary} strokeWidth={2}
                  fill="url(#appGrad)" dot={{ fill: COLORS.primary, r: 3 }}
                  activeDot={{ r: 5, fill: COLORS.primary }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Per-Job Stats Bar Chart ── */}
      {jobBarData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Applications & Scores Per Job
            </CardTitle>
            <CardDescription>Total applicants and average AI score for each job posting</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={jobBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                <Bar dataKey="Applications" fill={COLORS.blue}    radius={[4,4,0,0]} maxBarSize={40} />
                <Bar dataKey="Avg Score"    fill={COLORS.primary} radius={[4,4,0,0]} maxBarSize={40} />
                <Bar dataKey="Passed"       fill={COLORS.cyan}    radius={[4,4,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Pie Charts Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Job Status Pie */}
        {statusPie.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-sm flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-primary" /> Job Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={statusPie} cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    paddingAngle={3} dataKey="value"
                  >
                    {statusPie.map((entry, i) => (
                      <Cell key={`${entry.name}-${entry.value}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Filter Pass/Fail Pie */}
        {filterPie.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Hard Filter Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={filterPie} cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    paddingAngle={3} dataKey="value"
                  >
                    {filterPie.map((entry, i) => (
                      <Cell key={`${entry.name}-${entry.value}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Score Distribution Bar */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreDist} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[4,4,0,0]} maxBarSize={40}>
                  {scoreDist.map((entry, i) => (
                    <Cell key={`${entry.range}-${entry.count}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Job Score Range Chart ── */}
      {selectableScoreJobs.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-foreground text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Score Range Per Job (Min / Avg / Max)
                </CardTitle>
                <CardDescription>Switch jobs to inspect scoring spread candidate-by-candidate</CardDescription>
              </div>
              <Select value={selectedScoreJob?.job_id ?? ""} onValueChange={setSelectedScoreJobId}>
                <SelectTrigger className="w-full bg-input border-border text-foreground sm:w-[240px]">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {selectableScoreJobs.map(job => (
                    <SelectItem key={job.job_id} value={job.job_id}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {selectedScoreJob ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={[
                      { name: "Min", Score: Math.round(selectedScoreJob.low_score || 0), fill: COLORS.red },
                      { name: "Avg", Score: Math.round(selectedScoreJob.avg_score || 0), fill: COLORS.yellow },
                      { name: "Max", Score: Math.round(selectedScoreJob.top_score || 0), fill: COLORS.primary },
                    ]}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={50} stroke="#374151" strokeDasharray="4 4" />
                    <Bar dataKey="Score" radius={[6, 6, 0, 0]} maxBarSize={70}>
                      <Cell fill={COLORS.red} />
                      <Cell fill={COLORS.yellow} />
                      <Cell fill={COLORS.primary} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Applicants</p>
                    <p className="text-lg font-semibold text-foreground">{selectedScoreJob.total_applications}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Passed Filter</p>
                    <p className="text-lg font-semibold text-foreground">{selectedScoreJob.passed_filter}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Failed Filter</p>
                    <p className="text-lg font-semibold text-foreground">{selectedScoreJob.failed_filter}</p>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* ── Radar — Job Performance ── */}
      {radarData.length > 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Job Performance Radar
            </CardTitle>
            <CardDescription>Multi-dimensional view of each job's performance</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="job" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: "#9ca3af", fontSize: 9 }} />
                <Radar name="Avg Score" dataKey="Avg Score"
                  stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.2} />
                <Radar name="Pass Rate" dataKey="Pass Rate"
                  stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={0.2} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {jobStats.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center space-y-3">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium text-foreground">No data yet</p>
            <p className="text-sm text-muted-foreground">
              Post jobs and receive applications to see analytics here
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
