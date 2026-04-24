"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { authService } from "@/lib/authService"
import { profileService } from "@/lib/profileService"
import { applyTheme, resolveStoredTheme, themeKeyForPath, type AppTheme } from "@/lib/theme"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sparkles,
  LogOut,
  Settings,
  User,
  Menu,
  X,
  ChevronRight,
  Moon,
  Sun,
  type LucideIcon,
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
  const pathname = usePathname()
  const avatarObjectUrlRef = useRef<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [theme, setTheme] = useState<AppTheme>("dark")
  const hasAnyIndicator = Object.values(navIndicators ?? {}).some(Boolean)
  const homePath = role === "hr" ? "/hr" : "/candidate"
  const profilePath = role === "hr" ? "/hr/profile" : "/candidate/profile"
  const settingsPath = role === "hr" ? "/hr/settings" : "/candidate/settings"

  useEffect(() => {
    const resolved = resolveStoredTheme(pathname, (key) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    })
    setTheme(resolved)
    applyTheme(resolved)
  }, [pathname])

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    const key = themeKeyForPath(pathname)
    setTheme(next)
    try {
      localStorage.setItem(key, next)
    } catch {}
    applyTheme(next)
  }

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

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const requestLogout = () => {
    // Defer one tick so a DropdownMenu item that triggered us finishes
    // unmounting before Radix AlertDialog takes focus. Without this the
    // dialog can briefly appear behind a lingering pointer-events lock.
    setTimeout(() => setLogoutConfirmOpen(true), 0)
  }

  const confirmLogout = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      await authService.logout()
      router.push("/")
    } finally {
      setIsSigningOut(false)
      setLogoutConfirmOpen(false)
    }
  }

  const initials = userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  const activeNavItem = navItems.find(item => item.id === activeSection)
  const currentNavLabel = activeNavItem?.label

  return (
    <div className="relative min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-sidebar-border/70 bg-sidebar/[0.98] px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-card/90 text-foreground transition-colors hover:bg-secondary"
            aria-label="Toggle sidebar"
          >
            {hasAnyIndicator && (
              <span className="absolute -right-1 -top-1 inline-flex h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            )}
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Link href={homePath} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary shadow-[0_2px_8px_color-mix(in_oklch,var(--primary)_30%,transparent)]">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-[14px] font-bold tracking-[0.13em] text-foreground">TRIPLET</span>
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          {role === "hr" && <NotificationBell />}
          {role === "candidate" && <CandidateNotificationBell />}
          <UserMenu
            userName={userName}
            userEmail={userEmail}
            onLogout={requestLogout}
            role={role}
            avatarUrl={avatarUrl}
          />
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-[268px] border-r border-sidebar-border/70 bg-sidebar backdrop-blur-xl
          transform transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
          lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-[62px] items-center gap-3 border-b border-sidebar-border/60 px-5">
            <Link href={homePath} className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary shadow-[0_2px_10px_color-mix(in_oklch,var(--primary)_32%,transparent)]">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <span className="block text-[14.5px] font-bold tracking-[0.13em] text-foreground">TRIPLET</span>
                <span className="block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                  {role === "hr" ? "Hiring Studio" : "Talent Portal"}
                </span>
              </div>
            </Link>
          </div>

          {/* Section Label */}
          <div className="px-4 pt-4 pb-2">
            <p className="flex items-center gap-2 rounded-lg bg-primary/[0.08] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary dark:bg-primary/[0.12]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {role === "hr" ? "Workspace" : "Menu"}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
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
                    group relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left
                    transition-all duration-200
                    ${isActive
                      ? "bg-primary/[0.09] text-primary dark:bg-primary/[0.14]"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                    }
                  `}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
                  )}
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"}`} />
                  <span className="text-[13.5px] font-semibold tracking-[-0.01em]">{item.label}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {hasIndicator && (
                      <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    )}
                    {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                  </div>
                </button>
              )
            })}
          </nav>

          {/* User Section */}
          <div className="border-t border-sidebar-border/60 p-3 space-y-1">
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-sidebar-accent/60">
              <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-sidebar-foreground">{userName}</p>
                <p className="truncate text-[11px] text-muted-foreground/70">{userEmail}</p>
              </div>
              <button
                onClick={toggleTheme}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2.5 h-8 px-3 rounded-[10px] text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              onClick={requestLogout}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="lg:ml-[268px] pt-14 lg:pt-0 min-h-screen">
        {/* Desktop Header */}
        <header className="sticky top-0 z-30 hidden h-[62px] items-center justify-between border-b border-border/50 bg-background/90 px-6 backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {(() => {
                const Icon = navItems.find(item => item.id === activeSection)?.icon
                return Icon ? <Icon className="h-3.5 w-3.5" /> : null
              })()}
            </div>
            <div>
              <h1 className="text-[14.5px] font-semibold tracking-[-0.02em] text-foreground capitalize leading-none">
                {currentNavLabel}
              </h1>
              <p className="mt-1 text-[10.5px] text-muted-foreground/70 leading-none">
                {role === "hr" ? "Manage hiring with confidence" : "Track your opportunities"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {role === "hr" && <NotificationBell />}
            {role === "candidate" && <CandidateNotificationBell />}
            <UserMenu
              userName={userName}
              userEmail={userEmail}
              onLogout={requestLogout}
              role={role}
              avatarUrl={avatarUrl}
            />
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-5">
          <div className="mx-auto w-full max-w-[1520px]">{children}</div>
        </div>
      </main>

      <AlertDialog
        open={logoutConfirmOpen}
        onOpenChange={(open) => {
          if (!isSigningOut) setLogoutConfirmOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Triplet?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to sign in again to access your {role === "hr" ? "hiring" : "candidate"} dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSigningOut}>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmLogout()
              }}
              disabled={isSigningOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  const initials = userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full p-0 hover:bg-secondary"
        >
          <Avatar className="h-8 w-8 border border-border/60">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-semibold text-foreground">{userName}</p>
            <p className="text-xs font-normal text-muted-foreground">{userEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigateIfNeeded(profilePath)}
          className="cursor-pointer"
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigateIfNeeded(settingsPath)}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
