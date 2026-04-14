"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { authService } from "@/lib/authService"
import { profileService } from "@/lib/profileService"
import { NotificationBell } from "@/components/hr/notification-bell"
import { CandidateNotificationBell } from "@/components/candidate/notification-bell"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Sparkles, 
  LogOut, 
  Settings, 
  User, 
  Menu, 
  X,
  ChevronRight,
  type LucideIcon
} from "lucide-react"

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

interface DashboardLayoutProps {
  role: "candidate" | "hr"
  navItems: NavItem[]
  activeSection: string
  onSectionChange: (section: string) => void
  navIndicators?: Partial<Record<string, boolean>>
  userName: string
  userEmail: string
  children: React.ReactNode
}

export function DashboardLayout({
  role,
  navItems,
  activeSection,
  onSectionChange,
  navIndicators,
  userName,
  userEmail,
  children,
}: DashboardLayoutProps) {
  const router = useRouter()
  const avatarObjectUrlRef = useRef<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const hasAnyIndicator = Object.values(navIndicators ?? {}).some(Boolean)
  const homePath = role === "hr" ? "/hr" : "/candidate"
  const profilePath = role === "hr" ? "/hr/profile" : "/candidate/profile"
  const settingsPath = role === "hr" ? "/hr/settings" : "/candidate/settings"

  useEffect(() => {
    router.prefetch(homePath)
    router.prefetch(profilePath)
    router.prefetch(settingsPath)
  }, [homePath, profilePath, router, settingsPath])

  useEffect(() => {
    const revokeAvatarObjectUrl = () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current)
        avatarObjectUrlRef.current = null
      }
    }

    const loadAvatar = async () => {
      try {
        const profile = await profileService.getMe()
        if (!profile.profile?.profile_picture_url) {
          revokeAvatarObjectUrl()
          setAvatarUrl(null)
          return
        }
        const blob = await profileService.getProfilePicture(String(Date.now()))
        revokeAvatarObjectUrl()
        const objectUrl = URL.createObjectURL(blob)
        avatarObjectUrlRef.current = objectUrl
        setAvatarUrl(objectUrl)
      } catch {
        revokeAvatarObjectUrl()
        setAvatarUrl(null)
      }
    }

    const handleAvatarUpdated = () => {
      void loadAvatar()
    }

    void loadAvatar()
    window.addEventListener("triplet:profile-avatar-updated", handleAvatarUpdated)

    return () => {
      window.removeEventListener("triplet:profile-avatar-updated", handleAvatarUpdated)
      revokeAvatarObjectUrl()
    }
  }, [])

  const handleLogout = async () => {
    await authService.logout()
    router.push("/")
  }

  return (
    <div className="relative min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border/90 bg-sidebar/96 px-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] backdrop-blur-md dark:bg-sidebar/94">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="relative rounded-xl border border-border/80 bg-card/94 p-2 shadow-sm transition-colors hover:bg-secondary dark:bg-card/88"
          >
            {hasAnyIndicator && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
            )}
            {sidebarOpen ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-foreground" />}
          </button>
          <Link href={homePath} className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <span className="block text-sm font-bold tracking-[0.16em] text-foreground">TRIPLET</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {role === "hr" ? "Hiring Studio" : "Talent Workspace"}
              </span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {role === "hr"        && <NotificationBell />}
          {role === "candidate" && <CandidateNotificationBell />}
          <UserMenu
            userName={userName}
            userEmail={userEmail}
            onLogout={handleLogout}
            role={role}
            avatarUrl={avatarUrl}
          />
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-40 h-full w-64 border-r border-sidebar-border/90 bg-sidebar/98 shadow-[0_18px_36px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-sidebar/96
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/70 px-6">
            <Link href={homePath} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <span className="block text-lg font-bold tracking-[0.14em] text-foreground">TRIPLET</span>
                <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Smart Hiring
                </span>
              </div>
            </Link>
          </div>

          {/* Role Badge */}
          <div className="px-4 py-4">
            <div className="rounded-2xl border border-primary/22 bg-primary/12 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                {role === "hr" ? "HR Dashboard" : "Candidate Portal"}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              const hasIndicator = Boolean(navIndicators?.[item.id])
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSectionChange(item.id)
                    setSidebarOpen(false)
                  }}
                  className={`
                    w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left
                    transition-all duration-200 group
                    ${isActive 
                      ? 'bg-primary text-primary-foreground shadow-[0_8px_18px_rgba(15,23,42,0.12)]' 
                      : 'text-foreground/84 hover:bg-sidebar-accent hover:text-foreground'
                    }
                  `}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary-foreground' : ''}`} />
                  <span className="font-medium tracking-[-0.01em]">{item.label}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {hasIndicator && (
                      <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isActive ? "bg-emerald-100 shadow-[0_0_0_3px_rgba(255,255,255,0.16)]" : "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"}`} />
                    )}
                    {isActive && (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </button>
              )
            })}
          </nav>

          {/* User Section */}
          <div className="border-t border-sidebar-border/70 p-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/94 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)] dark:bg-card/86">
              <Avatar className="h-10 w-10 border border-border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {userName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              className="mt-3 w-full justify-start rounded-2xl text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-background/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        {/* Desktop Header */}
        <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border/90 bg-sidebar/94 px-8 shadow-[0_12px_24px_rgba(15,23,42,0.06)] backdrop-blur-md dark:bg-sidebar/92 lg:flex">
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-foreground capitalize">
              {navItems.find(item => item.id === activeSection)?.label}
            </h1>
            <p className="text-xs text-muted-foreground">
              {role === "hr" ? "Operate hiring with confidence" : "Track opportunities and communication"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {role === "hr"        && <NotificationBell />}
            {role === "candidate" && <CandidateNotificationBell />}
            <UserMenu
              userName={userName}
              userEmail={userEmail}
              onLogout={handleLogout}
              role={role}
              avatarUrl={avatarUrl}
            />
          </div>
        </header>

        {/* Content */}
        <div className="p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1520px]">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

function UserMenu({
  userName,
  userEmail,
  onLogout,
  role,
  avatarUrl,
}: {
  userName: string
  userEmail: string
  onLogout: () => void
  role: "candidate" | "hr"
  avatarUrl?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()

  const profilePath = role === "hr" ? "/hr/profile" : "/candidate/profile"
  const settingsPath = role === "hr" ? "/hr/settings" : "/candidate/settings"

  const navigateIfNeeded = (path: string) => {
    if (pathname !== path) {
      router.push(path)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full border border-border/80 bg-card/94 p-0 shadow-sm hover:bg-secondary/90 dark:bg-card/86">
          <Avatar className="h-10 w-10 border border-border">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {userName.split(" ").map((n) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl border-border/70 bg-card shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:bg-card/96">
        <DropdownMenuLabel className="text-foreground">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={() => navigateIfNeeded(profilePath)}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigateIfNeeded(settingsPath)}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem
          onClick={onLogout}
          className="text-destructive hover:bg-destructive/10 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
