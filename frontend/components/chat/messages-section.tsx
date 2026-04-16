"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Briefcase, ChevronDown, ChevronRight, Loader2, MessageSquare, Search } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ChatWindow } from "@/components/chat/chat-window"
import api from "@/lib/api"

interface Conversation {
  id              : string
  application_id  : string
  job_title       : string
  other_party     : string
  last_message    : string | null
  last_message_at : string | null
  unread_count    : number
}

interface ConversationGroup {
  id: string
  other_party: string
  conversations: Conversation[]
  latest_message_at: string | null
  latest_message: string | null
  unread_count: number
}

function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  <  1) return "just now"
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function toTimeValue(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0
}

export function MessagesSection() {
  const pathname = usePathname()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState("")
  const [activeId, setActiveId]           = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  const activeConv = conversations.find((c) => c.id === activeId) ?? null
  const currentRole = pathname.startsWith("/hr") ? "hr" : "candidate"

  const load = useCallback(async () => {
    try {
      const data = await api.get<Conversation[]>("/api/messages/conversations")
      setConversations(Array.isArray(data) ? data : [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount + every 30s
  useEffect(() => {
    load()
    const interval = setInterval(load, 4_000)
    return () => clearInterval(interval)
  }, [load])

  const groupedConversations = useMemo<ConversationGroup[]>(() => {
    const groups = new Map<string, ConversationGroup>()

    conversations.forEach((conversation) => {
      const key = conversation.other_party?.trim() || "Unknown"
      const existing = groups.get(key)

      if (existing) {
        existing.conversations.push(conversation)
        existing.unread_count += conversation.unread_count
        if (toTimeValue(conversation.last_message_at) > toTimeValue(existing.latest_message_at)) {
          existing.latest_message_at = conversation.last_message_at
          existing.latest_message = conversation.last_message
        }
      } else {
        groups.set(key, {
          id: key.toLowerCase(),
          other_party: key,
          conversations: [conversation],
          latest_message_at: conversation.last_message_at,
          latest_message: conversation.last_message,
          unread_count: conversation.unread_count,
        })
      }
    })

    return [...groups.values()]
      .map((group) => ({
        ...group,
        conversations: [...group.conversations].sort(
          (a, b) => toTimeValue(b.last_message_at) - toTimeValue(a.last_message_at),
        ),
      }))
      .sort((a, b) => toTimeValue(b.latest_message_at) - toTimeValue(a.latest_message_at))
  }, [conversations])

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return groupedConversations

    return groupedConversations
      .map((group) => {
        const matchesGroup = group.other_party.toLowerCase().includes(query)
        const matchingConversations = matchesGroup
          ? group.conversations
          : group.conversations.filter((conversation) =>
              conversation.job_title?.toLowerCase().includes(query) ||
              conversation.last_message?.toLowerCase().includes(query),
            )

        if (!matchesGroup && matchingConversations.length === 0) return null

        return {
          ...group,
          conversations: matchingConversations,
        }
      })
      .filter((group): group is ConversationGroup => Boolean(group))
  }, [groupedConversations, search])

  useEffect(() => {
    if (!activeConv?.other_party) return
    setExpandedGroups((current) =>
      current.includes(activeConv.other_party)
        ? current
        : [...current, activeConv.other_party],
    )
  }, [activeConv?.id, activeConv?.other_party])

  useEffect(() => {
    if (!search.trim()) return
    setExpandedGroups(filteredGroups.map((group) => group.other_party))
  }, [filteredGroups, search])

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((current) =>
      current.includes(groupName)
        ? current.filter((item) => item !== groupName)
        : [...current, groupName],
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Messages</h2>
        <p className="text-sm text-muted-foreground">Your hiring conversations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">

        {/* ── Conversation list ── */}
        <div className="space-y-3 lg:col-span-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 border-border bg-input text-sm text-foreground"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center space-y-2">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
              </CardContent>
            </Card>
          ) : (
            filteredGroups.map((group) => {
              const isExpanded = expandedGroups.includes(group.other_party)
              return (
                <div key={group.other_party} className="space-y-2">
                  <button
                    onClick={() => toggleGroup(group.other_party)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors hover:bg-secondary/40 ${
                      isExpanded ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 shrink-0 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {initials(group.other_party ?? "?")}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {group.unread_count > 0 && (
                              <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                            )}
                            <p className="truncate text-[15px] font-semibold text-foreground">
                              {group.other_party}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {timeAgo(group.latest_message_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                          {group.conversations.length} job thread{group.conversations.length > 1 ? "s" : ""}
                        </p>
                        {group.latest_message && (
                          <p className="mt-1 truncate text-[13px] leading-5 text-muted-foreground/80">
                            {group.latest_message}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {group.unread_count > 0 && (
                          <Badge className="flex h-5 min-w-[20px] items-center justify-center bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                            {group.unread_count}
                          </Badge>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 pl-4">
                      {group.conversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          onClick={() => setActiveId(conversation.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-secondary/40 ${
                            activeId === conversation.id
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-card/80"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                              <Briefcase className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  {conversation.unread_count > 0 && (
                                    <span className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.16)]" />
                                  )}
                                  <p className="truncate text-[14px] font-semibold text-foreground">
                                    {conversation.job_title}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                                  {timeAgo(conversation.last_message_at)}
                                </span>
                              </div>
                              {conversation.last_message && (
                                <p className="mt-1 truncate text-[13px] leading-5 text-muted-foreground">
                                  {conversation.last_message}
                                </p>
                              )}
                            </div>
                            {conversation.unread_count > 0 && (
                              <Badge className="flex h-5 min-w-[20px] items-center justify-center bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                                {conversation.unread_count}
                              </Badge>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Chat pane ── */}
        <div className="lg:col-span-2">
          {activeConv ? (
            <Card className="border-border bg-card h-[600px] flex flex-col overflow-hidden">
              <ChatWindow
                conversationId={activeConv.id}
                jobTitle={activeConv.job_title}
                otherPartyName={activeConv.other_party}
                currentRole={currentRole}
                onClose={() => setActiveId(null)}
              />
            </Card>
          ) : (
            <Card className="border-border bg-card h-[600px] flex items-center justify-center">
              <div className="text-center space-y-2">
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto opacity-30" />
                <p className="text-sm font-medium text-foreground">Select a conversation</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Choose a conversation from the list to start chatting
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
