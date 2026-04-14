"use client"

import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface Props {
  content: string
  children: ReactNode
  position?: "top" | "bottom" | "left" | "right"
  className?: string
}

export function TooltipWrapper({
  content,
  children,
  position = "top",
  className,
}: Props) {
  if (!content) return <>{children}</>

  const trigger = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{ className?: string }>,
        {
          className: cn((children.props as { className?: string }).className, className),
        },
      )
    : (
      <span className={cn("inline-flex", className)}>
        {children}
      </span>
    )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side={position}>
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
