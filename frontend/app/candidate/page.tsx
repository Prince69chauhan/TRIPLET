"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"
import { DashboardSectionSkeleton } from "@/components/dashboard/section-skeleton"
import { Briefcase, FileText, MessageSquare } from "lucide-react"
import api from "@/lib/api"
import { jobService } from "@/lib/jobService"
import { subscribeToIndicatorChanges, syncAvailableJobsIndicator } from "@/lib/activity-indicators"
import { useRoleGuard } from "@/hooks/use-role-guard"

const JobsSection = dynamic(
  () => import("@/components/candidate/jobs-section").then((module) => module.JobsSection),
  {
    ssr: false,
    loading: () => <DashboardSectionSkeleton cards={3} rows={5} />,
  },
)

const DocumentsSection = dynamic(
  () => import("@/components/candidate/documents-section").then((module) => module.DocumentsSection),
  {
    ssr: false,
    loading: () => <DashboardSectionSkeleton cards={2} rows={4} />,
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
  { id: "jobs",      label: "Jobs",          icon: Briefcase     },
  { id: "documents", label: "My Documents",  icon: FileText      },
  { id: "messages",  label: "Messages",      icon: MessageSquare },
]

function CandidateDashboardContent() {
  const router = useRouter()
  const { authorized, checking } = useRoleGuard("candidate")
  const searchParams = useSearchParams()
  const allowedSections = useMemo(() => new Set(navItems.map((item) => item.id)), [])
  const sectionFromUrl = searchParams.get("section")
  const initialSection = sectionFromUrl && allowedSections.has(sectionFromUrl) ? sectionFromUrl : "jobs"

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
    const nextSection = sectionFromUrl && allowedSections.has(sectionFromUrl) ? sectionFromUrl : "jobs"
    setActiveSection(nextSection)
  }, [allowedSections, sectionFromUrl])

  const loadIndicators = useCallback(async () => {
    try {
      const [jobsResult, conversationsResult] = await Promise.all([
        jobService.discoverJobs({
          sort_by: "created_at",
          sort_order: "desc",
          page: 1,
          page_size: 50,
          force: true,
        }) as Promise<{ items?: Array<{ id: string }> }>,
        api.get<Array<{ unread_count: number }>>("/api/messages/conversations"),
      ])

      const unseenAvailableJobs = syncAvailableJobsIndicator(
        "candidate",
        Array.isArray(jobsResult?.items) ? jobsResult.items.map((job) => job.id) : [],
      )
      const hasUnreadMessages = Array.isArray(conversationsResult)
        ? conversationsResult.some((conversation) => (conversation.unread_count ?? 0) > 0)
        : false

      setNavIndicators({
        jobs: unseenAvailableJobs.length > 0,
        messages: hasUnreadMessages,
      })
    } catch {
      setNavIndicators((current) => ({
        ...current,
        messages: current.messages ?? false,
        jobs: current.jobs ?? false,
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
    router.replace(`/candidate?${params.toString()}`)
  }

  if (checking || !authorized) {
    return <div className="min-h-screen bg-background p-6"><DashboardSectionSkeleton cards={3} rows={5} /></div>
  }

  return (
    <DashboardLayout 
      role="candidate"
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={handleSectionChange}
      navIndicators={navIndicators}
      userName={userName}
      userEmail={userEmail}
    >
      {activeSection === "jobs"      && <JobsSection />}
      {activeSection === "documents" && <DocumentsSection />}
      {activeSection === "messages"  && <MessagesSection />}
    </DashboardLayout>
  )
}

export default function CandidateDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-6"><DashboardSectionSkeleton cards={3} rows={5} /></div>}>
      <CandidateDashboardContent />
    </Suspense>
  )
}
