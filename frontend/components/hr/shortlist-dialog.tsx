"use client"

import { useEffect, useMemo, useState } from "react"
import { jobService } from "@/lib/jobService"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquare,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"

interface RankedCandidate {
  rank: number
  application_id: string
  full_name: string
  final_score_d: number | null
}

function buildShortlistTemplate(jobTitle: string) {
  return `Hi {name},\n\nGreat news! You have been shortlisted for the position of ${jobTitle}.\n\nWe were impressed by your profile and would like to move forward with you. We will be in touch shortly with the next steps.\n\nCongratulations and best of luck!\n\n- HR Team`
}

function buildRejectionTemplate(jobTitle: string) {
  return `Hi {name},\n\nThank you for applying for ${jobTitle}.\n\nAfter careful review of all applications, we have decided to move forward with other candidates whose profiles more closely match our current requirements.\n\nWe appreciate the time you invested and encourage you to apply for future openings.\n\nBest wishes,\n- HR Team`
}

const pct = (value?: number | null) =>
  typeof value === "number" && !Number.isNaN(value)
    ? Math.max(0, Math.min(100, Math.round(value * 10) / 10))
    : 0

export function ShortlistDialog({
  open,
  onClose,
  candidates,
  jobId,
  jobTitle,
  preselected,
  onCompleted,
}: {
  open: boolean
  onClose: () => void
  candidates: RankedCandidate[]
  jobId: string
  jobTitle: string
  preselected: RankedCandidate | null
  onCompleted: () => Promise<void> | void
}) {
  const [count, setCount] = useState(preselected ? 1 : 3)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const defaultShortlistMsg = useMemo(() => buildShortlistTemplate(jobTitle), [jobTitle])
  const defaultRejectionMsg = useMemo(() => buildRejectionTemplate(jobTitle), [jobTitle])
  const [shortlistMsg, setShortlistMsg] = useState(defaultShortlistMsg)
  const [rejectionMsg, setRejectionMsg] = useState(defaultRejectionMsg)

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => (b.final_score_d ?? 0) - (a.final_score_d ?? 0)),
    [candidates],
  )

  useEffect(() => {
    setCount(preselected ? 1 : 3)
    setSending(false)
    setSent(false)
    setError(null)
    setShowTemplates(false)
    setShortlistMsg(defaultShortlistMsg)
    setRejectionMsg(defaultRejectionMsg)
  }, [defaultRejectionMsg, defaultShortlistMsg, open, preselected])

  const shortlisted = preselected ? [preselected] : sorted.slice(0, count)
  const rejected = preselected ? [] : sorted.slice(count)

  const handleSend = async () => {
    setSending(true)
    setError(null)

    const shortlistBody = shortlistMsg.trim()
    const rejectionBody = rejectionMsg.trim()

    try {
      if (preselected) {
        await jobService.shortlistCandidates(jobId, {
          application_ids: [preselected.application_id],
          reject_others: false,
          custom_shortlist_msg: shortlistBody || undefined,
        })
      } else {
        await jobService.shortlistCandidates(jobId, {
          top_n: count,
          reject_others: true,
          custom_shortlist_msg: shortlistBody || undefined,
          custom_rejection_msg: rejectionBody || undefined,
        })
      }

      await onCompleted()
      setSending(false)
      setSent(true)
      window.setTimeout(() => {
        setSent(false)
        onClose()
      }, 2200)
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message ?? "Failed to send shortlist emails")
        : "Failed to send shortlist emails"
      setSending(false)
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Star className="h-5 w-5 text-primary" />
            {preselected ? "Shortlist Candidate" : "Bulk Shortlist"}
          </DialogTitle>
          <DialogDescription>
            {preselected
              ? `Send shortlist message to ${preselected.full_name}`
              : `Select top N candidates for ${jobTitle}`}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-3 py-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <p className="font-medium text-foreground">Done!</p>
            <p className="text-sm text-muted-foreground">
              {shortlisted.length} candidate{shortlisted.length > 1 ? "s" : ""} notified via email and in-app message.
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-5">
            {!preselected && (
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Number of candidates to shortlist</Label>
                <div className="flex flex-wrap gap-2">
                  {[3, 5, 10, 15, 20].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCount(Math.min(sorted.length || 1, value))}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        count === value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-secondary text-foreground hover:border-primary/50"
                      }`}
                    >
                      Top {value}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={Math.max(sorted.length, 1)}
                    value={count}
                    onChange={(event) =>
                      setCount(
                        Math.min(
                          Math.max(sorted.length, 1),
                          Math.max(1, parseInt(event.target.value, 10) || 1),
                        ),
                      )
                    }
                    className="w-16 rounded-lg border border-border bg-input px-2 py-1.5 text-sm text-foreground"
                    placeholder="N"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ThumbsUp className="h-4 w-4 text-green-500" />
                Will receive congratulations ({shortlisted.length})
              </p>
              <div className="max-h-36 space-y-1.5 overflow-y-auto">
                {shortlisted.map((candidate, index) => (
                  <div
                    key={candidate.application_id}
                    className="flex items-center justify-between rounded-lg bg-green-500/10 p-2 text-sm"
                  >
                    <span className="text-foreground">#{index + 1} {candidate.full_name}</span>
                    <span className="font-medium text-green-400">{pct(candidate.final_score_d)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {rejected.length > 0 && !preselected && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ThumbsDown className="h-4 w-4 text-red-400" />
                  Will receive polite rejection ({rejected.length})
                </p>
                <div className="max-h-28 space-y-1.5 overflow-y-auto">
                  {rejected.slice(0, 5).map((candidate) => (
                    <div
                      key={candidate.application_id}
                      className="flex items-center justify-between rounded-lg bg-secondary/30 p-2 text-sm"
                    >
                      <span className="text-muted-foreground">{candidate.full_name}</span>
                      <span className="text-muted-foreground">{pct(candidate.final_score_d)}%</span>
                    </div>
                  ))}
                  {rejected.length > 5 && (
                    <p className="text-center text-xs text-muted-foreground">
                      +{rejected.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setShowTemplates((current) => !current)}
                className="flex w-full items-center justify-between bg-secondary/30 px-4 py-3 text-sm transition-colors hover:bg-secondary/50"
              >
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Customize Auto-Messages
                  <span className="text-xs font-normal text-muted-foreground">
                    (sent via in-app chat and email)
                  </span>
                </div>
                {showTemplates
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showTemplates && (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  <p className="text-xs text-muted-foreground">
                    Use <code className="rounded bg-secondary px-1">{"{name}"}</code> as the candidate name placeholder.
                  </p>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-green-400">Shortlist message</Label>
                    <Textarea
                      value={shortlistMsg}
                      onChange={(event) => setShortlistMsg(event.target.value)}
                      rows={5}
                      className="resize-none border-border bg-input text-xs text-foreground"
                    />
                  </div>

                  {!preselected && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-red-400">Rejection message</Label>
                      <Textarea
                        value={rejectionMsg}
                        onChange={(event) => setRejectionMsg(event.target.value)}
                        rows={5}
                        className="resize-none border-border bg-input text-xs text-foreground"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-3 border-t border-border pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1 border-border text-foreground">
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || shortlisted.length === 0}
                className="flex-1 bg-primary text-primary-foreground"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send & Notify
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
