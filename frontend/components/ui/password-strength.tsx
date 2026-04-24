"use client"

import { useMemo } from "react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  PASSWORD_RULES,
  evaluatePassword,
  type PasswordStrength,
} from "@/lib/password-policy"

type Props = {
  value: string
  className?: string
  hideWhenEmpty?: boolean
}

const STRENGTH_META: Record<
  PasswordStrength["label"],
  { text: string; bar: string; fill: number }
> = {
  "Too short": { text: "text-muted-foreground", bar: "bg-muted",          fill: 0 },
  Weak:        { text: "text-red-500",          bar: "bg-red-500",        fill: 25 },
  Fair:        { text: "text-orange-500",       bar: "bg-orange-500",     fill: 50 },
  Good:        { text: "text-yellow-500",       bar: "bg-yellow-500",     fill: 75 },
  Strong:      { text: "text-green-500",        bar: "bg-green-500",      fill: 100 },
}

export function PasswordStrengthMeter({ value, className, hideWhenEmpty = true }: Props) {
  const strength = useMemo(() => evaluatePassword(value), [value])
  const meta = STRENGTH_META[strength.label]

  if (hideWhenEmpty && value.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Password strength</span>
        <span className={cn("font-medium", meta.text)}>{strength.label}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all duration-200", meta.bar)}
          style={{ width: `${meta.fill}%` }}
        />
      </div>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {PASSWORD_RULES.map(rule => {
          const ok = strength.satisfied.has(rule.id)
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5 text-[11px]",
                ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
              )}
            >
              {ok
                ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                : <X className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2.5} />}
              <span>{rule.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
