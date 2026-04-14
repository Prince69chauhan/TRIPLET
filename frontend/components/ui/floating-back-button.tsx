"use client"

import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FloatingBackButtonProps {
  onClick: () => void
  label?: string
  disabled?: boolean
  className?: string
}

export function FloatingBackButton({
  onClick,
  label = "Back",
  disabled = false,
  className,
}: FloatingBackButtonProps) {
  return (
    <div className={cn("fixed left-4 top-4 z-50 sm:left-6 sm:top-6", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className="rounded-full border-border bg-card/95 px-4 text-foreground shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/80 hover:bg-secondary"
        aria-label={label}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {label}
      </Button>
    </div>
  )
}
