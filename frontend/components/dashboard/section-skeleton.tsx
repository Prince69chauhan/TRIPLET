"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSectionSkeleton({
  cards = 3,
  rows = 4,
}: {
  cards?: number
  rows?: number
}) {
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${cards >= 3 ? "xl:grid-cols-3" : ""}`}>
        {Array.from({ length: cards }).map((_, index) => (
          <Card key={`card-${index}`} className="border-border/70 bg-card/92">
            <CardContent className="flex items-center gap-4 p-6">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/92">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={`row-${index}`} className="rounded-2xl border border-border/60 bg-background/35 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-full max-w-xl" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function AnalyticsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`metric-${index}`} className="border-border/70 bg-card/92">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/92">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-[220px] w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  )
}
