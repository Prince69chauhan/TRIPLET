"use client"

import type { ElementType, ReactNode } from "react"
import { Ban, CheckCircle2, PauseCircle } from "lucide-react"
import type { JobLifecycleStatus } from "./types"

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

export function formatValue(
  value: number | string | null | undefined,
  fallback = "Not specified",
): string {
  return value === null || value === undefined || value === "" ? fallback : String(value)
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "scored":
      return "bg-green-500/10 text-green-500"
    case "shortlisted":
      return "bg-primary/10 text-primary"
    case "rejected":
      return "bg-red-500/10 text-red-500"
    case "processing":
      return "bg-yellow-500/10 text-yellow-500"
    default:
      return "bg-secondary text-muted-foreground"
  }
}

export function getJobLifecycleBadge(status?: JobLifecycleStatus) {
  switch (status) {
    case "paused":
      return {
        label: "Paused",
        className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        icon: PauseCircle,
      }
    case "removed":
      return {
        label: "Removed",
        className: "bg-red-500/10 text-red-500 border-red-500/20",
        icon: Ban,
      }
    case "completed":
      return {
        label: "Completed",
        className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        icon: CheckCircle2,
      }
    default:
      return null
  }
}

export function CandidateDetailSectionHeading({
  icon: Icon,
  title,
}: {
  icon: ElementType
  title: string
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border/50 pb-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  )
}

export function CandidateDetailStatRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3.5 py-2.5 dark:bg-secondary/20">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground break-keep whitespace-normal">
        {label}
      </span>
      <span className="flex-1 break-keep whitespace-normal text-sm font-bold text-foreground" title={value}>
        {value}
      </span>
    </div>
  )
}

export function CandidateDetailInfoCell({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/60 px-3.5 py-3 dark:bg-background/30">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground break-keep whitespace-normal">{label}</p>
      <div className="break-keep whitespace-normal text-sm font-semibold leading-snug text-foreground">{value}</div>
    </div>
  )
}
