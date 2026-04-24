"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, CheckCheck, Loader2, MessageCircle, Paperclip, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { authService } from "@/lib/authService"

interface Message {
  id              : string
  sender_id       : string
  sender_role     : string
  content         : string
  attachment_url  : string | null
  attachment_name : string | null
  is_read         : boolean
  created_at      : string
  is_mine         : boolean
}

interface ChatWindowProps {
  conversationId : string
  jobTitle       : string
  otherPartyName : string
  currentRole?   : "hr" | "candidate"
  onClose        : () => void
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function ChatWindow({
  conversationId,
  jobTitle,
  otherPartyName,
  currentRole,
  onClose,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState("")
  const [sending, setSending]   = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef     = useRef<WebSocket | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const currentRoleRef = useRef<"hr" | "candidate">(currentRole ?? "candidate")
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const syncCurrentUser = async () => {
      try {
        const me = await authService.getMe()
        if (!active) return
        currentUserIdRef.current = me.id
        currentRoleRef.current = me.role === "employer" ? "hr" : "candidate"
      } catch {
        if (!active) return
        currentUserIdRef.current = null
        currentRoleRef.current = currentRole ?? (authService.getRole() === "employer" ? "hr" : "candidate")
      }
    }

    void syncCurrentUser()

    return () => {
      active = false
    }
  }, [currentRole])

  const loadMessages = useCallback(async () => {
    const __t0 = performance.now()
    try {
      const data = await api.get<Message[]>(`/api/messages/conversations/${conversationId}`)
      console.log(`[latency] chat.loadMessages: ${(performance.now() - __t0).toFixed(1)}ms`)
      setMessages(Array.isArray(data) ? data : [])
    } catch {
      console.log(`[latency] chat.loadMessages (error): ${(performance.now() - __t0).toFixed(1)}ms`)
      /* ignore */
    } finally {
      setInitialLoading(false)
    }
  }, [conversationId])

  // Fetch history + mark read on open
  useEffect(() => {
    loadMessages()
    api.patch(`/api/messages/conversations/${conversationId}/read`).catch(() => {})
  }, [conversationId, loadMessages])

  // Poll as a fallback so conversations stay live even if WebSocket drops.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadMessages()
    }, 4_000)

    return () => clearInterval(interval)
  }, [loadMessages])

  // WebSocket for real-time incoming messages
  useEffect(() => {
    const base  = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/^http/, "ws")
    const wsUrl = `${base}/api/messages/ws/${conversationId}`
    const ws    = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.event === "new_message") {
          if (msg.created_at) {
            const deliveryMs = Date.now() - new Date(msg.created_at).getTime()
            console.log(`[latency] chat.wsDelivery: ${deliveryMs}ms`)
          }
          const isMine = currentUserIdRef.current
            ? msg.sender_id === currentUserIdRef.current
            : msg.sender_role === currentRoleRef.current
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === msg.id)
            if (existingIndex >= 0) {
              return prev.map((message, index) =>
                index === existingIndex
                  ? { ...message, ...msg, is_mine: isMine }
                  : message,
              )
            }
            return [...prev, { ...msg, is_mine: isMine }]
          })
          if (!isMine) {
            api.patch(`/api/messages/conversations/${conversationId}/read`).catch(() => {})
          }
        }
      } catch { /* ignore malformed frames */ }
    }

    // Keep-alive ping every 20s
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send("ping")
    }, 20_000)

    return () => {
      clearInterval(ping)
      ws.close()
    }
  }, [conversationId])

  // Scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput("")
    setSending(true)
    const __t0 = performance.now()
    try {
      const msg = await api.post<Message>(
        `/api/messages/conversations/${conversationId}`,
        { content: text },
      )
      console.log(`[latency] chat.sendMessage: ${(performance.now() - __t0).toFixed(1)}ms`)
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
    } catch {
      console.log(`[latency] chat.sendMessage (error): ${(performance.now() - __t0).toFixed(1)}ms`)
      setInput((current) => current || text)
    } finally {
      setSending(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    const __t0 = performance.now()
    try {
      const msg = await api.postForm<Message>(
        `/api/messages/conversations/${conversationId}/attachment`,
        formData,
      )
      console.log(`[latency] chat.uploadAttachment (${file.size}B): ${(performance.now() - __t0).toFixed(1)}ms`)
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
    } catch {
      console.log(`[latency] chat.uploadAttachment (error): ${(performance.now() - __t0).toFixed(1)}ms`)
      /* ignore */
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-card/60 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary ring-1 ring-primary/15">
            <span className="text-[12.5px] font-bold">
              {otherPartyName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-foreground">{otherPartyName}</p>
            <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{jobTitle}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Message list */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {initialLoading && messages.length === 0 && (
          <div className="space-y-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`h-12 w-[62%] animate-pulse rounded-2xl ${
                    i % 2 === 0
                      ? "rounded-bl-sm bg-secondary/70"
                      : "rounded-br-sm bg-primary/25"
                  }`}
                />
              </div>
            ))}
          </div>
        )}
        {!initialLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/60 border border-border/40">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium leading-5 text-foreground">
                No messages yet
              </p>
              <p className="text-[12px] leading-5 text-muted-foreground">
                Say hello to {otherPartyName.split(" ")[0] || "them"} and start the conversation.
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex animate-in fade-in slide-in-from-bottom-1 duration-200 ${msg.is_mine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[76%] space-y-1.5 rounded-[18px] px-3.5 py-2.5 ${
                msg.is_mine
                  ? "rounded-br-[5px] bg-primary text-primary-foreground shadow-[0_2px_14px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
                  : "rounded-bl-[5px] border border-border/50 bg-secondary/70 text-foreground"
              }`}
            >
              {msg.attachment_url && (
                <a
                  href={msg.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                    msg.is_mine
                      ? "bg-white/10 hover:bg-white/15"
                      : "bg-background/50 hover:bg-background/80"
                  }`}
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{msg.attachment_name || "Attachment"}</span>
                </a>
              )}
              <p className="whitespace-pre-wrap break-normal text-[14.5px] leading-[1.55]">{msg.content}</p>
              <div
                className={`flex items-center gap-1.5 text-[10.5px] font-medium tabular-nums ${
                  msg.is_mine ? "justify-end text-primary-foreground/80" : "text-muted-foreground"
                }`}
              >
                <span>{fmtTime(msg.created_at)}</span>
                {msg.is_mine && (
                  msg.is_read
                    ? <CheckCheck className="h-3 w-3" />
                    : <Check className="h-3 w-3" />
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border/50 bg-card/40 px-3 py-2.5 backdrop-blur-xl">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFileUpload(file)
            e.target.value = ""
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          className="h-9 w-9 shrink-0 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type a message..."
          className="h-9 flex-1 rounded-full border-border/60 bg-secondary/50 px-4 text-[13.5px] text-foreground placeholder:text-muted-foreground/70"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          size="sm"
          className="h-9 w-9 shrink-0 rounded-full p-0 shadow-[0_2px_12px_color-mix(in_oklch,var(--primary)_26%,transparent)]"
          title="Send"
        >
          {sending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />
          }
        </Button>
      </div>
    </>
  )
}
