"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Briefcase, ChevronDown, ChevronRight, Loader2, MessageSquare, Search, SlidersHorizontal } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChatWindow } from "@/components/chat/chat-window"
import api from "@/lib/api"

interface Conversation {
  id              : string
  application_id  : string
  job_title       : string
  other_party     : string
  last_message    : string | null
  last_message_at : string | null
  message_count   : number
  attachment_count: number
  unread_count    : number
}

interface ConversationGroup {
  id: string
  other_party: string
  conversations: Conversation[]
  latest_message_at: string | null
  latest_message: string | null
  message_count: number
  attachment_count: number
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
  const [messageFilter, setMessageFilter] = useState<"all" | "unread" | "files">("all")
  const [messageSort, setMessageSort] = useState<"latest" | "oldest" | "most_messages" | "least_messages" | "most_unread">("latest")
  const [filtersOpen, setFiltersOpen]     = useState(false)
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
        existing.message_count += conversation.message_count
        existing.attachment_count += conversation.attachment_count
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
          message_count: conversation.message_count,
          attachment_count: conversation.attachment_count,
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
    const baseGroups = groupedConversations
      .map((group) => {
        let scopedConversations = group.conversations

        if (messageFilter === "unread") {
          scopedConversations = scopedConversations.filter((conversation) => conversation.unread_count > 0)
        } else if (messageFilter === "files") {
          scopedConversations = scopedConversations.filter((conversation) => conversation.attachment_count > 0)
        }

        if (scopedConversations.length === 0) return null

        const latestScoped = [...scopedConversations].sort(
          (a, b) => toTimeValue(b.last_message_at) - toTimeValue(a.last_message_at),
        )[0]

        return {
          ...group,
          conversations: scopedConversations,
          latest_message_at: latestScoped?.last_message_at ?? group.latest_message_at,
          latest_message: latestScoped?.last_message ?? group.latest_message,
          unread_count: scopedConversations.reduce((total, conversation) => total + conversation.unread_count, 0),
          message_count: scopedConversations.reduce((total, conversation) => total + conversation.message_count, 0),
          attachment_count: scopedConversations.reduce((total, conversation) => total + conversation.attachment_count, 0),
        }
      })
      .filter((group): group is ConversationGroup => Boolean(group))

    const queryFiltered = !query ? baseGroups : baseGroups
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
          latest_message_at: matchingConversations[0]?.last_message_at ?? group.latest_message_at,
          latest_message: matchingConversations[0]?.last_message ?? group.latest_message,
          unread_count: matchingConversations.reduce((total, conversation) => total + conversation.unread_count, 0),
          message_count: matchingConversations.reduce((total, conversation) => total + conversation.message_count, 0),
          attachment_count: matchingConversations.reduce((total, conversation) => total + conversation.attachment_count, 0),
        }
      })
      .filter((group): group is ConversationGroup => Boolean(group))

    return [...queryFiltered].sort((a, b) => {
      if (messageSort === "oldest") {
        return toTimeValue(a.latest_message_at) - toTimeValue(b.latest_message_at)
      }
      if (messageSort === "most_messages") {
        return b.message_count - a.message_count || toTimeValue(b.latest_message_at) - toTimeValue(a.latest_message_at)
      }
      if (messageSort === "least_messages") {
        return a.message_count - b.message_count || toTimeValue(a.latest_message_at) - toTimeValue(b.latest_message_at)
      }
      if (messageSort === "most_unread") {
        return b.unread_count - a.unread_count || toTimeValue(b.latest_message_at) - toTimeValue(a.latest_message_at)
      }
      return toTimeValue(b.latest_message_at) - toTimeValue(a.latest_message_at)
    })
  }, [groupedConversations, messageFilter, messageSort, search])

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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground sm:text-xl">Messages</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">Your hiring conversations</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-start">

        {/* ── Conversation list ── */}
        <div className="space-y-2.5 lg:col-span-1">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="space-y-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="pl-9 border-border bg-input text-sm text-foreground"
                />
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="h-10 justify-between border-border/60 text-foreground sm:min-w-[168px]">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    Filter
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {messageFilter === "all"
                      ? messageSort === "latest"
                        ? "Latest first"
                        : messageSort === "oldest"
                          ? "Oldest first"
                          : messageSort === "most_messages"
                            ? "Most stacked"
                            : messageSort === "least_messages"
                              ? "Least stacked"
                              : "Most unread"
                      : messageFilter === "unread"
                        ? "Unread only"
                        : "File messages"}
                  </span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="pt-0.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Select value={messageFilter} onValueChange={(value) => setMessageFilter(value as "all" | "unread" | "files")}>
                  <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                    <SelectValue placeholder="Filter messages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Messages</SelectItem>
                    <SelectItem value="unread">Unread Only</SelectItem>
                    <SelectItem value="files">File Messages</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={messageSort} onValueChange={(value) => setMessageSort(value as "latest" | "oldest" | "most_messages" | "least_messages" | "most_unread")}>
                  <SelectTrigger className="h-9 w-full border-border/60 bg-input text-[13px] text-foreground">
                    <SelectValue placeholder="Sort messages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="most_messages">Most Stacked</SelectItem>
                    <SelectItem value="least_messages">Least Stacked</SelectItem>
                    <SelectItem value="most_unread">Most Unread</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </Collapsible>

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
                <div key={group.other_party} className="space-y-1.5">
                  <button
                    onClick={() => toggleGroup(group.other_party)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-secondary/40 ${
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
                            <p className="truncate text-[14px] font-semibold text-foreground">
                              {group.other_party}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                            {timeAgo(group.latest_message_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                          {group.conversations.length} job thread{group.conversations.length > 1 ? "s" : ""} · {group.message_count} msg
                        </p>
                        {group.latest_message && (
                          <p className="mt-1 truncate text-[12px] leading-5 text-muted-foreground/80">
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
                    <div className="space-y-1.5 pl-3">
                      {group.conversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          onClick={() => setActiveId(conversation.id)}
                          className={`w-full rounded-xl border p-2.5 text-left transition-colors hover:bg-secondary/40 ${
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
                                  <p className="truncate text-[13px] font-semibold text-foreground">
                                    {conversation.job_title}
                                  </p>
                                </div>
                                <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                                  {timeAgo(conversation.last_message_at)}
                                </span>
                              </div>
                              {conversation.last_message && (
                                <p className="mt-1 truncate text-[12px] leading-5 text-muted-foreground">
                                  {conversation.last_message}
                                </p>
                              )}
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {conversation.message_count} msg{conversation.message_count !== 1 ? "s" : ""}{conversation.attachment_count > 0 ? ` · ${conversation.attachment_count} file` : ""}
                              </p>
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
            <Card className="border-border bg-card flex h-[68vh] min-h-[460px] flex-col overflow-hidden sm:h-[600px]">
              <ChatWindow
                conversationId={activeConv.id}
                jobTitle={activeConv.job_title}
                otherPartyName={activeConv.other_party}
                currentRole={currentRole}
                onClose={() => setActiveId(null)}
              />
            </Card>
          ) : (
            <Card className="border-border bg-card flex h-[68vh] min-h-[460px] items-center justify-center sm:h-[600px]">
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
