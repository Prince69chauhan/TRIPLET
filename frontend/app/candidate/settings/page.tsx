"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { profileService, type NotificationPreferences } from "@/lib/profileService"
import { clearAuthSession } from "@/lib/browser-session"
import { useTheme } from "@/hooks/useTheme"
import { useRoleGuard } from "@/hooks/use-role-guard"
import {
  Moon, Sun, Lock,
  Trash2, AlertCircle, CheckCircle2, Loader2, Shield, AlertTriangle,
  Bell, MessageSquare, Mail, Briefcase, type LucideIcon,
} from "lucide-react"

const defaultNotificationPreferences: NotificationPreferences = {
  in_app_enabled: true,
  message_notifications: true,
  application_updates: true,
  email_message_digest: true,
  email_application_updates: true,
  security_alerts: true,
}

export default function CandidateSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const expectedRole = pathname.startsWith("/hr") ? "employer" : "candidate"
  const isEmployer = expectedRole === "employer"
  const { authorized, checking } = useRoleGuard(expectedRole)
  const { theme, toggleTheme } = useTheme()

  const [passwords, setPasswords] = useState({
    current: "", newPass: "", confirm: ""
  })
  const [pwLoading, setPwLoading]   = useState(false)
  const [pwSuccess, setPwSuccess]   = useState("")
  const [pwError, setPwError]       = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences)
  const [notificationLoading, setNotificationLoading] = useState(true)
  const [notificationSavingKey, setNotificationSavingKey] = useState<keyof NotificationPreferences | null>(null)
  const [notificationError, setNotificationError] = useState("")
  const [notificationSuccess, setNotificationSuccess] = useState("")

  useEffect(() => {
    if (!authorized) return
    let active = true

    const loadNotificationSettings = async () => {
      setNotificationLoading(true)
      setNotificationError("")
      try {
        const data = await profileService.getNotificationSettings()
        if (active) {
          setNotificationPreferences({ ...defaultNotificationPreferences, ...data })
        }
      } catch {
        if (active) {
          setNotificationError("Could not load notification settings.")
        }
      } finally {
        if (active) {
          setNotificationLoading(false)
        }
      }
    }

    void loadNotificationSettings()
    return () => {
      active = false
    }
  }, [authorized])

  const handleChangePassword = async () => {
    setPwError(""); setPwSuccess("")
    if (passwords.newPass !== passwords.confirm) {
      setPwError("New passwords do not match."); return
    }
    if (passwords.newPass.length < 8) {
      setPwError("Password must be at least 8 characters."); return
    }
    setPwLoading(true)
    try {
      await profileService.changePassword(passwords.current, passwords.newPass)
      setPwSuccess("Password changed successfully!")
      setPasswords({ current: "", newPass: "", confirm: "" })
      setTimeout(() => setPwSuccess(""), 4000)
    } catch (e: any) {
      setPwError(e?.response?.data?.detail || "Failed to change password.")
    } finally {
      setPwLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError("")
    try {
      await profileService.deleteAccount()
      // Account is already deleted on backend; clear local session client-side.
      clearAuthSession()
      router.replace("/")
    } catch (e: any) {
      setDeleteError(e?.response?.data?.detail || "Failed to delete account. Please try again.")
      setDeleting(false)
    }
  }

  const resetDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setDeleteConfirmText("")
    setDeleteAcknowledged(false)
    setDeleteError("")
  }

  const confirmPhrase = "DELETE"
  const canConfirmDelete = deleteAcknowledged && deleteConfirmText.trim() === confirmPhrase

  const updateNotificationPreference = async (key: keyof NotificationPreferences, value: boolean) => {
    if (isEmployer && key === "security_alerts" && !value) return

    const previous = notificationPreferences
    const next = { ...previous, [key]: value }
    setNotificationPreferences(next)
    setNotificationSavingKey(key)
    setNotificationError("")
    setNotificationSuccess("")

    try {
      const saved = await profileService.updateNotificationSettings({ [key]: value })
      setNotificationPreferences({ ...defaultNotificationPreferences, ...saved })
      setNotificationSuccess("Notification settings saved.")
      window.setTimeout(() => setNotificationSuccess(""), 2500)
    } catch {
      setNotificationPreferences(previous)
      setNotificationError("Failed to save notification settings.")
    } finally {
      setNotificationSavingKey(null)
    }
  }

  const notificationRows: Array<{
    key: keyof NotificationPreferences
    title: string
    description: string
    icon: LucideIcon
    disabled?: boolean
  }> = [
    {
      key: "in_app_enabled",
      title: "In-app notification center",
      description: "Show alerts in the dashboard bell.",
      icon: Bell,
    },
    {
      key: "message_notifications",
      title: "Chat message alerts",
      description: "Show unread HR/candidate messages in the bell.",
      icon: MessageSquare,
    },
    {
      key: "email_message_digest",
      title: "Unread message email digest",
      description: "Send one email only when unread chats stay pending.",
      icon: Mail,
    },
    {
      key: "application_updates",
      title: isEmployer ? "Hiring activity updates" : "Application updates",
      description: isEmployer
        ? "Keep hiring and workflow updates visible in your workspace."
        : "Show application received, selected, and rejection updates.",
      icon: Briefcase,
    },
    {
      key: "email_application_updates",
      title: "Application update emails",
      description: isEmployer
        ? "Allow hiring workflow emails where applicable."
        : "Receive important application results by email.",
      icon: Mail,
    },
  ]

  if (isEmployer) {
    notificationRows.push({
      key: "security_alerts",
      title: "Resume security alerts",
      description: "Tamper alerts stay enabled for hiring safety.",
      icon: Shield,
      disabled: true,
    })
  }

  if (checking || !authorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingBackButton onClick={() => router.back()} />

      <div className="border-b border-border bg-card px-6 py-4">
        <div className="pl-20 sm:pl-24">
          <h1 className="font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">Manage your preferences</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Theme */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2 text-base">
              {theme === "dark"
                ? <Moon className="h-4 w-4 text-primary" />
                : <Sun className="h-4 w-4 text-yellow-400" />
              }
              Appearance
            </CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                {theme === "dark"
                  ? <Moon className="h-5 w-5 text-primary" />
                  : <Sun className="h-5 w-5 text-yellow-400" />
                }
                <div>
                  <p className="font-medium text-foreground text-sm">
                    {theme === "dark" ? "Dark Mode" : "Light Mode"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {theme === "dark" ? "Easy on the eyes" : "Bright and clear"}
                  </p>
                </div>
              </div>
              <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" /> Notifications
            </CardTitle>
            <CardDescription>Control dashboard alerts and email reminders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {notificationError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                <AlertCircle className="h-4 w-4" /> {notificationError}
              </div>
            )}
            {notificationSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
                <CheckCircle2 className="h-4 w-4" /> {notificationSuccess}
              </div>
            )}

            <div className="space-y-2">
              {notificationRows.map(({ key, title, description, icon: Icon, disabled }) => {
                const saving = notificationSavingKey === key
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-secondary/20 p-4"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                      <Switch
                        checked={disabled ? true : Boolean(notificationPreferences[key])}
                        disabled={notificationLoading || saving || disabled}
                        onCheckedChange={(checked) => updateNotificationPreference(key, checked)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-primary" /> Change Password
            </CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => { e.preventDefault(); handleChangePassword() }}
              className="space-y-4"
            >
              {pwSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> {pwSuccess}
                </div>
              )}
              {pwError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                  <AlertCircle className="h-4 w-4" /> {pwError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-foreground text-sm">Current Password</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" value={passwords.current}
                  onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                  className="bg-input border-border text-foreground" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-foreground text-sm">New Password</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" value={passwords.newPass}
                  onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))}
                  className="bg-input border-border text-foreground" placeholder="Min 8 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmNewPassword" className="text-foreground text-sm">Confirm New Password</Label>
                <Input id="confirmNewPassword" name="confirmNewPassword" type="password" autoComplete="new-password" value={passwords.confirm}
                  onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                  className="bg-input border-border text-foreground" placeholder="Repeat new password" />
              </div>
              <Button type="submit" disabled={pwLoading}
                className="bg-primary text-primary-foreground">
                {pwLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...</>
                  : <><Shield className="h-4 w-4 mr-2" /> Update Password</>
                }
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="bg-card border-red-500/20 border">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4" /> Danger Zone
            </CardTitle>
            <CardDescription>Permanent and irreversible actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {deleteError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                <AlertCircle className="h-4 w-4" /> {deleteError}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4
              p-4 rounded-lg bg-red-500/5 border border-red-500/20">
              <div>
                <p className="font-medium text-foreground text-sm">Delete Account</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permanently deletes your account, resume, and all data. Cannot be undone.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="border-red-500/40 text-red-500 hover:bg-red-500/10 shrink-0"
              >
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleting) return
          if (!open) resetDeleteDialog()
          else setDeleteDialogOpen(true)
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <AlertDialogTitle className="text-center text-foreground">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-muted-foreground">
              This action is <span className="font-semibold text-red-500">permanent</span> and cannot be undone.
              Your profile, resume, messages, and all associated data will be deleted immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <label className="flex items-start gap-3 rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2.5">
              <input
                type="checkbox"
                checked={deleteAcknowledged}
                onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                disabled={deleting}
                className="mt-0.5 h-4 w-4 rounded border-border accent-red-500"
              />
              <span className="text-sm text-foreground">
                I understand that deleting this account is permanent and cannot be undone.
              </span>
            </label>
            <Label htmlFor="deleteConfirm" className="text-sm text-foreground">
              Type <span className="font-mono font-semibold text-red-500">{confirmPhrase}</span> to confirm
            </Label>
            <Input
              id="deleteConfirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              disabled={deleting}
              autoComplete="off"
              className="bg-input border-border text-foreground"
            />
          </div>

          {deleteError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
              <AlertCircle className="h-4 w-4 shrink-0" /> {deleteError}
            </div>
          )}

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deleting}
              onClick={resetDeleteDialog}
              className="mt-0"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (canConfirmDelete && !deleting) handleDeleteAccount()
              }}
              disabled={!canConfirmDelete || deleting}
              className="bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 disabled:opacity-50"
            >
              {deleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="mr-2 h-4 w-4" /> Delete Account</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
