"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { DashboardSectionSkeleton } from "@/components/dashboard/section-skeleton"
import { PlusCircle, BarChart3, MessageSquare } from "lucide-react"
import api from "@/lib/api"
import { jobService } from "@/lib/jobService"
import { subscribeToIndicatorChanges, syncJobApplicationIndicators } from "@/lib/activity-indicators"

const PostJobSection = dynamic(
  () => import("@/components/hr/post-job-section").then((module) => module.PostJobSection),
  {
    ssr: false,
    loading: () => <DashboardSectionSkeleton cards={5} rows={6} />,
  },
)

const CandidateRankingSection = dynamic(
  () => import("@/components/hr/candidate-ranking-section").then((module) => module.CandidateRankingSection),
  {
    ssr: false,
    loading: () => <DashboardSectionSkeleton cards={4} rows={5} />,
  },
)

const MessagesSection = dynamic(
  () => import("@/components/chat/messages-section").then((module) => module.MessagesSection),
  {
    ssr: false,
    loading: () => <DashboardSectionSkeleton cards={2} rows={4} />,
  },
)

const navItems = [
  { id: "post-job",  label: "Post a Job",       icon: PlusCircle    },
  { id: "ranking",   label: "Candidate Ranking", icon: BarChart3     },
  { id: "messages",  label: "Messages",          icon: MessageSquare },
]

function HRDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const allowedSections = useMemo(() => new Set(navItems.map((item) => item.id)), [])
  const sectionFromUrl = searchParams.get("section")
  const initialSection = sectionFromUrl && allowedSections.has(sectionFromUrl) ? sectionFromUrl : "post-job"

  const [activeSection, setActiveSection] = useState(initialSection)
  const [userName, setUserName] = useState("Guest User")
  const [userEmail, setUserEmail] = useState("guest@email.com")
  const [navIndicators, setNavIndicators] = useState<Partial<Record<string, boolean>>>({})

  useEffect(() => {
    const storedName = sessionStorage.getItem("userName")
    const storedEmail = sessionStorage.getItem("userEmail")
    
    if (storedName) setUserName(storedName)
    if (storedEmail) setUserEmail(storedEmail)
  }, [])

  useEffect(() => {
    const nextSection = sectionFromUrl && allowedSections.has(sectionFromUrl) ? sectionFromUrl : "post-job"
    setActiveSection(nextSection)
  }, [allowedSections, sectionFromUrl])

  const loadIndicators = useCallback(async () => {
    try {
      const [analyticsResult, conversationsResult] = await Promise.all([
        jobService.getJobAnalytics({ force: true }) as Promise<Array<{ job_id: string; total_applications: number }>>,
        api.get<Array<{ unread_count: number }>>("/api/messages/conversations"),
      ])

      const unseenApplicationJobs = syncJobApplicationIndicators(
        "hr",
        Array.isArray(analyticsResult)
          ? analyticsResult.map((job) => ({
              jobId: job.job_id,
              totalApplications: job.total_applications ?? 0,
            }))
          : [],
      )
      const hasUnreadMessages = Array.isArray(conversationsResult)
        ? conversationsResult.some((conversation) => (conversation.unread_count ?? 0) > 0)
        : false

      setNavIndicators({
        ranking: unseenApplicationJobs.length > 0,
        messages: hasUnreadMessages,
      })
    } catch {
      setNavIndicators((current) => ({
        ...current,
        ranking: current.ranking ?? false,
        messages: current.messages ?? false,
      }))
    }
  }, [])

  useEffect(() => {
    void loadIndicators()
    const interval = window.setInterval(() => {
      void loadIndicators()
    }, 5_000)
    const unsubscribe = subscribeToIndicatorChanges(() => {
      void loadIndicators()
    })
    const handleVisibility = () => {
      if (!document.hidden) {
        void loadIndicators()
      }
    }
    window.addEventListener("focus", handleVisibility)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.clearInterval(interval)
      unsubscribe()
      window.removeEventListener("focus", handleVisibility)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [loadIndicators])

  const handleSectionChange = (section: string) => {
    setActiveSection(section)
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", section)
    if (section === "post-job") {
      params.set("hrJobTab", "post")
      params.set("postFocus", "form")
      params.set("postJump", String(Date.now()))
    } else {
      params.delete("postFocus")
      params.delete("postJump")
    }
    router.replace(`/hr?${params.toString()}`)
  }

  return (
    <DashboardLayout 
      role="hr"
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      navIndicators={navIndicators}
      userName={userName}
      userEmail={userEmail}
    >
      {activeSection === "post-job" && <PostJobSection />}
      {activeSection === "ranking"  && <CandidateRankingSection />}
      {activeSection === "messages" && <MessagesSection />}
    </DashboardLayout>
  )
}

export default function HRDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-6"><DashboardSectionSkeleton cards={5} rows={6} /></div>}>
      <HRDashboardContent />
    </Suspense>
  )
}
