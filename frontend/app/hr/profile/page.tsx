"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { profileService } from "@/lib/profileService"
import {
  Building, Camera, Save,
  AlertCircle, CheckCircle2, Loader2, Globe, Briefcase
} from "lucide-react"

export default function HRProfilePage() {
  const router      = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarObjectUrlRef = useRef<string | null>(null)

  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState("")
  const [error, setError]         = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [email, setEmail]         = useState("")
  const [joinedAt, setJoinedAt]   = useState("")

  const [form, setForm] = useState({
    company_name: "",
    website     : "",
    industry    : "",
  })

  const replaceAvatarPreview = (source: Blob | string) => {
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current)
      avatarObjectUrlRef.current = null
    }

    if (typeof source === "string") {
      setAvatarUrl(source)
      return
    }

    const objectUrl = URL.createObjectURL(source)
    avatarObjectUrlRef.current = objectUrl
    setAvatarUrl(objectUrl)
  }

  const notifyAvatarUpdated = () => {
    window.dispatchEvent(new Event("triplet:profile-avatar-updated"))
  }

  useEffect(() => {
    profileService.getMe().then(async (data) => {
      setEmail(data.email)
      setJoinedAt(data.created_at ? new Date(data.created_at).toLocaleDateString() : "")
      if (data.profile) {
        setForm({
          company_name: data.profile.company_name ?? "",
          website     : data.profile.website      ?? "",
          industry    : data.profile.industry     ?? "",
        })
        if (data.profile.profile_picture_url) {
          try {
            const blob = await profileService.getProfilePicture()
            replaceAvatarPreview(blob)
          } catch {
            replaceAvatarPreview(data.profile.profile_picture_url)
          }
        }
      }
    }).catch(() => {}).finally(() => setLoading(false))

    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current)
      }
    }
  }, [])

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("")
    try {
      await profileService.updateEmployerProfile(form)
      setSuccess("Profile saved successfully!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are allowed.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2MB.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setUploading(true)
    try {
      await profileService.uploadProfilePicture(file)
      replaceAvatarPreview(file)
      notifyAvatarUpdated()
      setError("")
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Upload failed.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const initials = form.company_name
    ? form.company_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "HR"

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <FloatingBackButton onClick={() => router.back()} />

      <div className="border-b border-border bg-card px-6 py-4">
        <div className="pl-20 sm:pl-24">
          <h1 className="font-semibold text-foreground">Company Profile</h1>
          <p className="text-xs text-muted-foreground">Manage your company information</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
            <CheckCircle2 className="h-4 w-4" /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
            <AlertCircle className="h-4 w-4" /> {error}
            <button onClick={() => setError("")} className="ml-auto">✕</button>
          </div>
        )}

        {/* Avatar */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="relative">
                <Avatar className="h-24 w-24 border-2 border-border">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={form.company_name} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary flex items-center
                    justify-center border-2 border-background hover:bg-primary/90 transition-colors">
                  {uploading
                    ? <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                    : <Camera className="h-3.5 w-3.5 text-primary-foreground" />
                  }
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{form.company_name || "Company Name"}</h2>
                <p className="text-sm text-muted-foreground">{email}</p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                  <Badge className="bg-primary/10 text-primary border-0 text-xs">Employer</Badge>
                  {joinedAt && <span className="text-xs text-muted-foreground">Joined {joinedAt}</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2 text-base">
              <Building className="h-4 w-4 text-primary" /> Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TooltipWrapper content="Your company's official registered name.">
              <div className="space-y-2">
                <Label className="text-foreground text-sm">Company Name</Label>
                <Input value={form.company_name}
                  onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))}
                  className="bg-input border-border text-foreground" placeholder="Acme Corp" />
              </div>
            </TooltipWrapper>
            <TooltipWrapper content="Your company website URL. Include https://.">
              <div className="space-y-2">
                <Label className="text-foreground text-sm">Website</Label>
                <Input value={form.website}
                  onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                  className="bg-input border-border text-foreground" placeholder="https://acme.com" />
              </div>
            </TooltipWrapper>
            <TooltipWrapper content="The industry your company operates in. e.g. Technology, Finance, Healthcare.">
              <div className="space-y-2">
                <Label className="text-foreground text-sm">Industry</Label>
                <Input value={form.industry}
                  onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
                  className="bg-input border-border text-foreground" placeholder="Technology" />
              </div>
            </TooltipWrapper>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground">
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
            : <><Save className="h-4 w-4 mr-2" /> Save Profile</>
          }
        </Button>
      </div>
    </div>
  )
}
