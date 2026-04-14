"use client"

import { useEffect, useRef } from "react"

export function useInfiniteScroll({
  enabled,
  onLoadMore,
  rootMargin = "320px",
}: {
  enabled: boolean
  onLoadMore: () => void
  rootMargin?: string
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const target = sentinelRef.current
    if (!target || !enabled) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { rootMargin },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [enabled, onLoadMore, rootMargin])

  return sentinelRef
}
