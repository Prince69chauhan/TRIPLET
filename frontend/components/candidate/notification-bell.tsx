"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { notificationService } from "@/lib/notificationService"
import {
  Bell, CheckCheck, X, Loader2,
  Send, Trophy, ThumbsDown, AlertTriangle, Info, MessageSquare
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Notification {
  id        : string
  type      : string
  subject   : string
  body      : string
  status    : string
  created_at: string
  is_read   : boolean
}

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return "just now"
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case "application_received":
      return <Send className="h-3.5 w-3.5 text-blue-400 shrink-0" />
    case "message":
      return <MessageSquare className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
    case "shortlisted":
      return <Trophy className="h-3.5 w-3.5 text-green-400 shrink-0" />
    case "advance":
      return <Trophy className="h-3.5 w-3.5 text-green-400 shrink-0" />
    case "rejection":
      return <ThumbsDown className="h-3.5 w-3.5 text-red-400 shrink-0" />
    case "tamper_alert":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
    default:
      return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  }
}

function notifColor(type: string): string {
  switch (type) {
    case "shortlisted":
    case "advance":
      return "border-l-green-500 bg-green-500/5"
    case "rejection":
      return "border-l-red-400 bg-red-500/5"
    case "tamper_alert":
      return "border-l-red-500 bg-red-500/5"
    case "application_received":
      return "border-l-blue-400 bg-blue-500/5"
    case "message":
      return "border-l-cyan-400 bg-cyan-500/5"
    default:
      return "border-l-primary bg-primary/5"
  }
}

export function CandidateNotificationBell() {
  const [open, setOpen]                   = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(false)
  const [marking, setMarking]             = useState<string | null>(null)
  const dropdownRef                       = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const load = useCallback(async () => {
    try {
      const data = await notificationService.getCandidateNotifications()
      setNotifications(Array.isArray(data) ? data : [])
    } catch {
      setNotifications([])
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (!open) return
    void load()
  }, [load, open])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load()
      }
    }

    const handleFocus = () => {
      void load()
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleFocus)
    }
  }, [load])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleMarkRead = async (id: string) => {
    setMarking(id)
    try {
      await notificationService.markCandidateAsRead(id)
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      )
    } catch { /* ignore */ }
    finally { setMarking(null) }
  }

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      await notificationService.markAllCandidateRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  return (
    <div className="relative" ref={dropdownRef}>

      {/* Bell */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative h-8 w-8 rounded-full flex items-center justify-center
          text-muted-foreground hover:text-foreground hover:bg-secondary/80
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40
          transition-all duration-200 active:scale-95"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <>
            <span className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full
              bg-red-500 text-white text-[9px] font-bold flex items-center
              justify-center ring-[1.5px] ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-88 bg-card/99 backdrop-blur-xl border border-border/60
          rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08),_0_0_0_1px_rgba(0,0,0,0.04)] z-50 overflow-hidden
          animate-in fade-in slide-in-from-top-1 duration-150">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold text-foreground text-[13px]">
                Notifications
              </span>
              {unreadCount > 0 && (
                <Badge className="bg-red-500/10 text-red-500 border-0 text-[10px] px-1.5 py-0">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground
                    hover:text-foreground transition-colors px-2 py-1 rounded-lg
                    hover:bg-secondary disabled:opacity-50"
                  title="Mark all as read"
                >
                  {loading
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <CheckCheck className="h-3 w-3" />
                  }
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-muted-foreground
                  hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[22rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center space-y-1.5">
                <Bell className="h-7 w-7 text-muted-foreground mx-auto opacity-40" />
                <p className="text-[13px] text-muted-foreground font-medium">No notifications yet</p>
                <p className="text-[11px] text-muted-foreground/70">
                  Apply to jobs to get updates here
                </p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-2.5 border-b border-border/40 transition-colors
                    hover:bg-secondary/20
                    ${!n.is_read ? `border-l-2 ${notifColor(n.type)}` : "pl-[18px]"}
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        {/* Type icon + subject */}
                        <div className="flex items-center gap-1.5">
                          <NotifIcon type={n.type} />
                          <p className={`text-[12.5px] font-medium truncate
                            ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                            {n.subject}
                          </p>
                        </div>
                        {/* Body preview */}
                        <p className="text-[11px] text-muted-foreground line-clamp-1 leading-snug">
                          {n.body.split("\n").filter(l => l.trim()).slice(0, 1).join(" ")}
                        </p>
                        {/* Time */}
                        <p className="text-[10px] text-muted-foreground/50">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                    {/* Mark read */}
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
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <CheckCheck className="h-3 w-3" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40">
              <p className="text-[10px] text-muted-foreground/60 text-center">
                Showing last 20 notifications
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
