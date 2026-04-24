"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { PasswordStrengthMeter } from "@/components/ui/password-strength"
import { Switch } from "@/components/ui/switch"
import { clearAuthSession } from "@/lib/browser-session"
import { evaluatePassword } from "@/lib/password-policy"
import {
  profileService,
  type NotificationPreferences,
} from "@/lib/profileService"
import { useIsMobile } from "@/hooks/use-mobile"
import { useRoleGuard } from "@/hooks/use-role-guard"
import { useTheme } from "@/hooks/useTheme"
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Moon,
  Shield,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react"

const defaultNotificationPreferences: NotificationPreferences = {
  in_app_enabled: true,
  message_notifications: true,
  application_updates: true,
  email_message_digest: true,
  email_application_updates: true,
  security_alerts: true,
}

type PasswordFieldKey = "current" | "newPass" | "confirm"

function ResponsiveSettingsSection({
  title,
  description,
  icon: Icon,
  children,
  isMobile,
  defaultOpen = false,
  className = "",
  contentClassName = "",
  titleClassName = "text-foreground",
  iconClassName = "text-primary",
}: {
  title: string
  description?: string
  icon: LucideIcon
  children: ReactNode
  isMobile: boolean
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
  titleClassName?: string
  iconClassName?: string
}) {
  if (isMobile) {
    return (
      <Card className={`bg-card border-border py-0 ${className}`}>
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultOpen ? "content" : undefined}
          className="w-full"
        >
          <AccordionItem value="content" className="border-b-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="text-left">
                <div
                  className={`flex items-center gap-2 text-sm font-semibold ${titleClassName}`}
                >
                  <Icon className={`h-4 w-4 ${iconClassName}`} />
                  {title}
                </div>
                {description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className={`px-4 pb-4 ${contentClassName}`}>
              {children}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    )
  }

  return (
    <Card className={`bg-card border-border ${className}`}>
      <CardHeader>
        <CardTitle
          className={`flex items-center gap-2 text-base ${titleClassName}`}
        >
          <Icon className={`h-4 w-4 ${iconClassName}`} />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  visible,
  onChange,
  onToggleVisibility,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  autoComplete: string
  visible: boolean
  onChange: (value: string) => void
  onToggleVisibility: () => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-foreground text-sm">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-input border-border pr-11 text-foreground"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export default function CandidateSettingsPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const expectedRole = pathname.startsWith("/hr") ? "employer" : "candidate"
  const isEmployer = expectedRole === "employer"
  const { authorized, checking } = useRoleGuard(expectedRole)
  const { theme, toggleTheme } = useTheme()

  const [passwords, setPasswords] = useState({
    current: "",
    newPass: "",
    confirm: "",
  })
  const [passwordVisibility, setPasswordVisibility] = useState<
    Record<PasswordFieldKey, boolean>
  >({
    current: false,
    newPass: false,
    confirm: false,
  })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwSuccess, setPwSuccess] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwOtp, setPwOtp] = useState("")
  const [pwOtpStep, setPwOtpStep] = useState(false)
  const [pwCountdown, setPwCountdown] = useState(0)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(defaultNotificationPreferences)
  const [notificationLoading, setNotificationLoading] = useState(true)
  const [notificationSavingKey, setNotificationSavingKey] =
    useState<keyof NotificationPreferences | null>(null)
  const [notificationError, setNotificationError] = useState("")
  const [notificationSuccess, setNotificationSuccess] = useState("")

  const passwordStrength = evaluatePassword(passwords.newPass)
  const confirmPhrase = "DELETE"
  const canConfirmDelete =
    deleteAcknowledged && deleteConfirmText.trim() === confirmPhrase

  useEffect(() => {
    if (!pwOtpStep || pwCountdown <= 0) return

    const timer = window.setTimeout(() => {
      setPwCountdown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [pwOtpStep, pwCountdown])

  useEffect(() => {
    if (!authorized) return
    let active = true

    const loadNotificationSettings = async () => {
      setNotificationLoading(true)
      setNotificationError("")

      try {
        const data = await profileService.getNotificationSettings()
        if (active) {
          setNotificationPreferences({
            ...defaultNotificationPreferences,
            ...data,
          })
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

  const togglePasswordVisibility = (field: PasswordFieldKey) => {
    setPasswordVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }))
  }

  const handleChangePassword = async () => {
    setPwError("")
    setPwSuccess("")

    if (passwords.newPass !== passwords.confirm) {
      setPwError("New passwords do not match.")
      return
    }

    if (!passwordStrength.isStrong) {
      setPwError("Password must satisfy all required strength rules.")
      return
    }

    setPwLoading(true)

    try {
      const response = await profileService.changePassword(
        passwords.current,
        passwords.newPass,
      )
      setPwSuccess(response.message || "Verification code sent to your email.")
      setPwOtp("")
      setPwOtpStep(true)
      setPwCountdown(response.expires_in || 240)
      window.setTimeout(() => setPwSuccess(""), 4000)
    } catch (e: any) {
      setPwError(e?.response?.data?.detail || "Failed to change password.")
    } finally {
      setPwLoading(false)
    }
  }

  const handleConfirmPasswordChange = async () => {
    setPwError("")
    setPwSuccess("")

    if (pwOtp.length !== 6) {
      setPwError("Please enter the 6-digit verification code.")
      return
    }

    setPwLoading(true)

    try {
      await profileService.confirmPasswordChange(
        passwords.current,
        passwords.newPass,
        pwOtp,
      )
      setPwSuccess("Password changed successfully!")
      setPasswords({ current: "", newPass: "", confirm: "" })
      setPwOtp("")
      setPwOtpStep(false)
      setPwCountdown(0)
      window.setTimeout(() => setPwSuccess(""), 4000)
    } catch (e: any) {
      setPwError(
        e?.response?.data?.detail || "Failed to verify and change password.",
      )
    } finally {
      setPwLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError("")

    try {
      await profileService.deleteAccount()
      clearAuthSession()
      router.replace("/")
    } catch (e: any) {
      setDeleteError(
        e?.response?.data?.detail ||
          "Failed to delete account. Please try again.",
      )
      setDeleting(false)
    }
  }

  const resetDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setDeleteConfirmText("")
    setDeleteAcknowledged(false)
    setDeleteError("")
  }

  const updateNotificationPreference = async (
    key: keyof NotificationPreferences,
    value: boolean,
  ) => {
    if (isEmployer && key === "security_alerts" && !value) return

    const previous = notificationPreferences
    const next = { ...previous, [key]: value }

    setNotificationPreferences(next)
    setNotificationSavingKey(key)
    setNotificationError("")
    setNotificationSuccess("")

    try {
      const saved = await profileService.updateNotificationSettings({
        [key]: value,
      })
      setNotificationPreferences({
        ...defaultNotificationPreferences,
        ...saved,
      })
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

      <div className="border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="pl-20 sm:pl-24">
          <h1 className="font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Manage your preferences
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:space-y-6 sm:p-6">
        <ResponsiveSettingsSection
          title="Appearance"
          description="Choose your preferred theme"
          icon={theme === "dark" ? Moon : Sun}
          isMobile={isMobile}
          defaultOpen
          iconClassName={theme === "dark" ? "text-primary" : "text-yellow-400"}
        >
          <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-4">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-yellow-400" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {theme === "dark" ? "Dark Mode" : "Light Mode"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {theme === "dark" ? "Easy on the eyes" : "Bright and clear"}
                </p>
              </div>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
          </div>
        </ResponsiveSettingsSection>

        <ResponsiveSettingsSection
          title="Notifications"
          description="Control dashboard alerts and email reminders"
          icon={Bell}
          isMobile={isMobile}
          contentClassName="space-y-3"
        >
          {notificationError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {notificationError}
            </div>
          )}

          {notificationSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              {notificationSuccess}
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
                      <p className="text-sm font-semibold text-foreground">
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {saving && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    )}
                    <Switch
                      checked={disabled ? true : Boolean(notificationPreferences[key])}
                      disabled={notificationLoading || saving || disabled}
                      onCheckedChange={(checked) =>
                        updateNotificationPreference(key, checked)
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </ResponsiveSettingsSection>

        <ResponsiveSettingsSection
          title="Change Password"
          description="Update your account password"
          icon={Lock}
          isMobile={isMobile}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (pwOtpStep) {
                handleConfirmPasswordChange()
                return
              }
              handleChangePassword()
            }}
            className="space-y-4"
          >
            {pwSuccess && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                {pwSuccess}
              </div>
            )}

            {pwError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {pwError}
              </div>
            )}

            <PasswordField
              id="currentPassword"
              label="Current Password"
              value={passwords.current}
              placeholder="Enter current password"
              autoComplete="current-password"
              visible={passwordVisibility.current}
              onChange={(value) =>
                setPasswords((current) => ({ ...current, current: value }))
              }
              onToggleVisibility={() => togglePasswordVisibility("current")}
            />

            <div className="space-y-2">
              <PasswordField
                id="newPassword"
                label="New Password"
                value={passwords.newPass}
                placeholder="Min 8 characters"
                autoComplete="new-password"
                visible={passwordVisibility.newPass}
                onChange={(value) =>
                  setPasswords((current) => ({ ...current, newPass: value }))
                }
                onToggleVisibility={() => togglePasswordVisibility("newPass")}
              />
              <PasswordStrengthMeter value={passwords.newPass} />
            </div>

            <PasswordField
              id="confirmNewPassword"
              label="Confirm New Password"
              value={passwords.confirm}
              placeholder="Repeat new password"
              autoComplete="new-password"
              visible={passwordVisibility.confirm}
              onChange={(value) =>
                setPasswords((current) => ({ ...current, confirm: value }))
              }
              onToggleVisibility={() => togglePasswordVisibility("confirm")}
            />

            {!pwOtpStep && (
              <Button
                type="submit"
                disabled={pwLoading}
                className="bg-primary text-primary-foreground"
              >
                {pwLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Send Verification Code
                  </>
                )}
              </Button>
            )}

            {pwOtpStep && (
              <div className="space-y-4 rounded-xl border border-border/70 bg-secondary/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Verify password change
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Enter the 6-digit code sent to your email to finish
                    updating your password.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground text-sm">
                    Verification Code
                  </Label>
                  <InputOTP
                    maxLength={6}
                    value={pwOtp}
                    onChange={setPwOtp}
                    containerClassName="justify-start"
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-xs text-muted-foreground">
                    {pwCountdown > 0
                      ? `Code expires in ${Math.floor(pwCountdown / 60)}:${String(
                          pwCountdown % 60,
                        ).padStart(2, "0")}`
                      : "Code expired. Request a new verification code."}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={handleConfirmPasswordChange}
                    disabled={pwLoading || pwOtp.length !== 6}
                    className="bg-primary text-primary-foreground"
                  >
                    {pwLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Verify & Update Password
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleChangePassword}
                    disabled={pwLoading || pwCountdown > 180}
                    className="border-border text-foreground"
                  >
                    Resend Code
                  </Button>
                </div>
              </div>
            )}
          </form>
        </ResponsiveSettingsSection>

        <ResponsiveSettingsSection
          title="Danger Zone"
          description="Permanent and irreversible actions"
          icon={Trash2}
          isMobile={isMobile}
          className="border border-red-500/20"
          contentClassName="space-y-4"
          titleClassName="text-red-500"
          iconClassName="text-red-500"
        >
          {deleteError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {deleteError}
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-foreground">
                Delete Account
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently deletes your account, resume, and all data.
                Cannot be undone.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="shrink-0 border-red-500/40 text-red-500 hover:bg-red-500/10"
            >
              Delete Account
            </Button>
          </div>
        </ResponsiveSettingsSection>
      </div>

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
              This action is{" "}
              <span className="font-semibold text-red-500">permanent</span> and
              cannot be undone. Your profile, resume, messages, and all
              associated data will be deleted immediately.
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
                I understand that deleting this account is permanent and cannot
                be undone.
              </span>
            </label>

            <Label htmlFor="deleteConfirm" className="text-sm text-foreground">
              Type{" "}
              <span className="font-mono font-semibold text-red-500">
                {confirmPhrase}
              </span>{" "}
              to confirm
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
              <AlertCircle className="h-4 w-4 shrink-0" />
              {deleteError}
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
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
