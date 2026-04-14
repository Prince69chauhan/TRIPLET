"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Bell, CheckCheck, Loader2, MessageSquare, Info } from "lucide-react"
import { notificationService } from "@/lib/notificationService"

interface Notification {
  id             : string
  type           : string
  subject        : string
  body           : string
  status         : string
  created_at     : string
  is_read        : boolean
  candidate_name : string | null
  job_title      : string | null
  resume_file    : string | null
}

function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case "tamper_alert":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
    case "message":
      return <MessageSquare className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
    default:
      return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  }
}

function notifColor(type: string): string {
  switch (type) {
    case "tamper_alert":
      return "bg-red-500/5 border-l-2 border-l-red-500"
    case "message":
      return "bg-cyan-500/5 border-l-2 border-l-cyan-400"
    default:
      return "bg-primary/5 border-l-2 border-l-primary"
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  1) return "just now"
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen]       = useState(false)
  const [marking, setMarking] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationService.getNotifications()
      setNotifications(Array.isArray(data) ? data : [])
    } catch {
      // silently fail — bell must not crash the header
    }
  }, [])

  // Initial fetch + 60-second poll
  useEffect(() => {
    void fetchNotifications()
    const interval = setInterval(() => {
      void fetchNotifications()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) return
    void fetchNotifications()
  }, [fetchNotifications, open])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications()
      }
    }

    const handleFocus = () => {
      void fetchNotifications()
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleFocus)
    }
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleMarkRead = async (id: string) => {
    setMarking(id)
    try {
      await notificationService.markAsRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, status: "sent" } : n))
      )
    } catch {
      // ignore
    } finally {
      setMarking(null)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, status: "sent" })))
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
        aria-label="Notifications"
      >
        <Bell
          className={`h-5 w-5 text-foreground ${unreadCount > 0 ? "animate-pulse" : ""}`}
        />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-normal text-red-500">
                  {unreadCount} unread
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border/50 transition-colors
                    hover:bg-secondary/30
                    ${!n.is_read ? notifColor(n.type) : ""}
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">

                      {/* Unread dot */}
                      <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0
                        ${!n.is_read ? (n.type === "tamper_alert" ? "bg-red-500" : "bg-cyan-400") : "bg-transparent"}`}
                      />

                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Alert header */}
                        <div className="flex items-center gap-1.5">
                          <NotifIcon type={n.type} />
                          <p className={`text-sm font-semibold truncate
                            ${!n.is_read
                              ? (n.type === "tamper_alert" ? "text-red-400" : "text-foreground")
                              : "text-muted-foreground"}`}>
                            {n.type === "tamper_alert" ? "Resume Tampered" : n.subject}
                          </p>
                        </div>

                        {/* Candidate name — most important */}
                        {n.type === "tamper_alert" ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground w-20 shrink-0">Candidate</span>
                              <span className="text-xs font-medium text-foreground truncate">
                                {n.candidate_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground w-20 shrink-0">Job</span>
                              <span className="text-xs text-foreground truncate">
                                {n.job_title}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground w-20 shrink-0">File</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {n.resume_file}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {n.body.split("\n").filter((line) => line.trim()).slice(0, 2).join(" ")}
                          </p>
                        )}

                        {/* Time */}
                        <p className="text-xs text-muted-foreground/60">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>

                    {/* Mark read button */}
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        disabled={marking === n.id}
                        className="shrink-0 p-1 rounded-lg text-muted-foreground
                          hover:text-green-500 hover:bg-green-500/10 transition-colors
                          disabled:opacity-50"
                        title="Mark as read"
                      >
                        {marking === n.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCheck className="h-3.5 w-3.5" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
