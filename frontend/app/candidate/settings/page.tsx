"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { profileService } from "@/lib/profileService"
import { clearAuthSession } from "@/lib/browser-session"
import { useTheme } from "@/hooks/useTheme"
import { useRoleGuard } from "@/hooks/use-role-guard"
import {
  Moon, Sun, Lock,
  Trash2, AlertCircle, CheckCircle2, Loader2, Shield
} from "lucide-react"

export default function CandidateSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const expectedRole = pathname.startsWith("/hr") ? "employer" : "candidate"
  const { authorized, checking } = useRoleGuard(expectedRole)
  const { theme, toggleTheme } = useTheme()

  const [passwords, setPasswords] = useState({
    current: "", newPass: "", confirm: ""
  })
  const [pwLoading, setPwLoading]   = useState(false)
  const [pwSuccess, setPwSuccess]   = useState("")
  const [pwError, setPwError]       = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState("")

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
    } finally {
      setDeleting(false)
    }
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
              {!deleteConfirm ? (
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(true)}
                  className="border-red-500/40 text-red-500 hover:bg-red-500/10 shrink-0">
                  Delete Account
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}
                    className="border-border text-muted-foreground">Cancel</Button>
                  <Button size="sm" onClick={handleDeleteAccount} disabled={deleting}
                    className="bg-red-500 text-white hover:bg-red-600">
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm Delete"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
