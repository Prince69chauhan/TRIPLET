import { useMemo, useRef } from "react"
import type { TouchEvent } from "react"

interface UseSwipeTabNavigationOptions<T extends string> {
  tabs: readonly T[]
  activeTab: T
  onChange: (tab: T) => void
  enabled?: boolean
  threshold?: number
}

const INTERACTIVE_SWIPE_GUARD = "input, textarea, select, [role='slider'], [data-no-swipe='true']"

export function useSwipeTabNavigation<T extends string>({
  tabs,
  activeTab,
  onChange,
  enabled = true,
  threshold = 56,
}: UseSwipeTabNavigationOptions<T>) {
  const startRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null)

  const handlers = useMemo(() => {
    const onTouchStart = (event: TouchEvent<HTMLElement>) => {
      if (!enabled) return

      const target = event.target as HTMLElement | null
      const touch = event.touches[0]
      startRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        ignore: Boolean(target?.closest(INTERACTIVE_SWIPE_GUARD)),
      }
    }

    const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
      if (!enabled || !startRef.current || startRef.current.ignore) {
        startRef.current = null
        return
      }

      const touch = event.changedTouches[0]
      const dx = touch.clientX - startRef.current.x
      const dy = touch.clientY - startRef.current.y
      startRef.current = null

      if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.2) {
        return
      }

      const currentIndex = tabs.indexOf(activeTab)
      if (currentIndex === -1) return

      if (dx < 0 && currentIndex < tabs.length - 1) {
        onChange(tabs[currentIndex + 1])
      } else if (dx > 0 && currentIndex > 0) {
        onChange(tabs[currentIndex - 1])
      }
    }

    return { onTouchStart, onTouchEnd }
  }, [activeTab, enabled, onChange, tabs, threshold])

  return handlers
}
