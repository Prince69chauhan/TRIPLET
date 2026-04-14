"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, CheckCheck, Loader2, Paperclip, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"

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
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef     = useRef<WebSocket | null>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const currentRoleRef = useRef<"hr" | "candidate">(currentRole ?? "candidate")

  useEffect(() => {
    if (currentRole) {
      currentRoleRef.current = currentRole
      return
    }

    if (typeof window !== "undefined") {
      const storedRole = localStorage.getItem("user_role")
      currentRoleRef.current = storedRole === "employer" ? "hr" : "candidate"
    }
  }, [currentRole])

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.get<Message[]>(`/api/messages/conversations/${conversationId}`)
      setMessages(Array.isArray(data) ? data : [])
    } catch {
      /* ignore */
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
          const isMine = msg.sender_role === currentRoleRef.current
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
    try {
      const msg = await api.post<Message>(
        `/api/messages/conversations/${conversationId}`,
        { content: text },
      )
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
    } catch {
      setInput((current) => current || text)
    } finally {
      setSending(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    try {
      const msg = await api.postForm<Message>(
        `/api/messages/conversations/${conversationId}/attachment`,
        formData,
      )
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])
    } catch { /* ignore */ }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <p className="text-base font-semibold tracking-[-0.01em] text-foreground">{otherPartyName}</p>
          <p className="text-[13px] leading-5 text-muted-foreground">{jobTitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Message list */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-[15px] leading-7 text-muted-foreground">
            No messages yet — say hello!
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[78%] space-y-2 rounded-2xl px-4 py-3 ${
                msg.is_mine
                  ? "rounded-br-sm bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                  : "rounded-bl-sm border border-border/70 bg-secondary/78 text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
              }`}
            >
              {msg.attachment_url && (
                <a
                  href={msg.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2 opacity-85 hover:opacity-100"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  {msg.attachment_name || "Attachment"}
                </a>
              )}
              <p className="break-words text-[15px] leading-7">{msg.content}</p>
              <div
                className={`flex items-center gap-1.5 text-[11px] font-medium tabular-nums ${
                  msg.is_mine ? "justify-end text-primary-foreground/75" : "text-muted-foreground"
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
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
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
          className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-foreground"
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
          className="flex-1 border-border bg-input text-[15px] text-foreground"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          size="sm"
          className="h-9 w-9 p-0 shrink-0"
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
