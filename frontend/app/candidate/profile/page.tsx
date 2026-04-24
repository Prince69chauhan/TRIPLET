"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { profileService } from "@/lib/profileService"
import { candidateService } from "@/lib/candidateService"
import { removeSessionValue } from "@/lib/browser-session"
import { cgpaToPercentage } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { useRoleGuard } from "@/hooks/use-role-guard"
import {
  User, Camera, Save, Upload,
  RefreshCw, AlertCircle, CheckCircle2,
  Loader2, GraduationCap, Phone, Building,
  FileText, RotateCcw, Sparkles, X, type LucideIcon
} from "lucide-react"

function ResponsiveSectionCard({
  title,
  description,
  icon: Icon,
  children,
  isMobile,
  defaultOpen = false,
  className = "",
  contentClassName = "",
}: {
  title: string
  description?: string
  icon: LucideIcon
  children: ReactNode
  isMobile: boolean
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
}) {
  if (isMobile) {
    return (
      <Card className={`bg-card border-border py-0 ${className}`}>
        <Accordion type="single" collapsible defaultValue={defaultOpen ? "content" : undefined} className="w-full">
          <AccordionItem value="content" className="border-b-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="text-left">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="h-4 w-4 text-primary" />
                  {title}
                </div>
                {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
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
        <CardTitle className="text-foreground flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

export default function CandidateProfilePage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { authorized, checking } = useRoleGuard("candidate")
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const resumeInputRef  = useRef<HTMLInputElement>(null)
  const avatarObjectUrlRef = useRef<string | null>(null)

  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState("")
  const [error, setError]         = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [resumeUploading, setResumeUploading] = useState(false)
  const [resumeSuccess, setResumeSuccess]     = useState("")
  const [parsedSkills, setParsedSkills]       = useState<string[]>([])
  const [newSkill, setNewSkill]               = useState("")
  const [skillsLoading, setSkillsLoading]     = useState(true)
  const [skillsSaving, setSkillsSaving]       = useState(false)
  const [skillsError, setSkillsError]         = useState("")
  const [skillsSuccess, setSkillsSuccess]     = useState("")

  const [form, setForm] = useState({
    full_name           : "",
    phone               : "",
    degree              : "",
    branch              : "",
    college             : "",
    cgpa                : "",
    passout_year        : "",
    has_gap             : false,
    gap_duration_months : "",
    active_backlogs     : "",
    total_backlogs      : "",
  })
  const [email, setEmail]       = useState("")
  const [joinedAt, setJoinedAt] = useState("")

  const loadParsedSkills = async (withPolling = false) => {
    setSkillsLoading(true)

    let attempts = 0
    const maxAttempts = withPolling ? 20 : 1

    while (attempts < maxAttempts) {
      try {
        const data = await candidateService.getParsedSkills()
        if (data.status === "done") {
          setParsedSkills(Array.isArray(data.skills) ? data.skills : [])
          setSkillsLoading(false)
          return
        }
      } catch {
        setParsedSkills([])
        setSkillsLoading(false)
        return
      }

      attempts += 1
      if (attempts < maxAttempts) {
        await new Promise(resolve => window.setTimeout(resolve, 3000))
      }
    }

    setParsedSkills([])
    setSkillsLoading(false)
  }

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
    if (!authorized) {
      return
    }
    profileService.getMe().then(async (data) => {
      setEmail(data.email)
      setJoinedAt(data.created_at ? new Date(data.created_at).toLocaleDateString() : "")
      if (data.profile) {
        const p = data.profile
        setForm({
          full_name           : p.full_name           ?? "",
          phone               : p.phone               ?? "",
          degree              : p.degree              ?? "",
          branch              : p.branch              ?? "",
          college             : p.college             ?? "",
          cgpa                : p.cgpa?.toString()    ?? "",
          passout_year        : p.passout_year?.toString() ?? "",
          has_gap             : p.has_gap             ?? false,
          gap_duration_months : p.gap_duration_months?.toString() ?? "",
          active_backlogs     : p.active_backlogs?.toString()    ?? "",
          total_backlogs      : p.total_backlogs?.toString()     ?? "",
        })
        if (p.profile_picture_url) {
          try {
            const blob = await profileService.getProfilePicture()
            replaceAvatarPreview(blob)
          } catch {
            replaceAvatarPreview(p.profile_picture_url)
          }
        }
      }
    }).catch(() => {}).finally(() => setLoading(false))

    void loadParsedSkills()
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current)
      }
    }
  }, [authorized])

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess("")
    try {
      await profileService.updateCandidateProfile({
        full_name           : form.full_name || undefined,
        phone               : form.phone || undefined,
        degree              : form.degree || undefined,
        branch              : form.branch || undefined,
        college             : form.college || undefined,
        cgpa                : form.cgpa ? parseFloat(form.cgpa) : undefined,
        passout_year        : form.passout_year ? parseInt(form.passout_year) : undefined,
        has_gap             : form.has_gap,
        gap_duration_months : form.gap_duration_months ? parseInt(form.gap_duration_months) : 0,
        active_backlogs     : form.active_backlogs ? parseInt(form.active_backlogs) : 0,
        total_backlogs      : form.total_backlogs ? parseInt(form.total_backlogs) : 0,
      })
      setSuccess("Profile saved successfully!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save profile.")
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
      setError(e?.response?.data?.detail || "Failed to upload picture.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleResumeReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeUploading(true); setResumeSuccess(""); setError("")
    try {
      // Delete old resume + parsed data first
      await profileService.resetResume()
      // Upload new resume
      await candidateService.uploadResume(file)
      setResumeSuccess("Resume re-uploaded successfully! Skills will be re-extracted shortly.")
      setParsedSkills([])
      setSkillsError("")
      setSkillsSuccess("")
      void loadParsedSkills(true)
      setTimeout(() => setResumeSuccess(""), 5000)
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to re-upload resume.")
    } finally {
      setResumeUploading(false)
      if (resumeInputRef.current) resumeInputRef.current.value = ""
    }
  }

  const handleAddSkill = async () => {
    const rawSkill = newSkill.trim()
    if (!rawSkill) return
    if (parsedSkills.some(skill => skill.toLowerCase() === rawSkill.toLowerCase())) {
      setNewSkill("")
      setSkillsError("")
      return
    }

    setSkillsError("")
    setSkillsSuccess("")
    try {
      const data = await candidateService.validateParsedSkill(rawSkill)
      setParsedSkills(current => [...current, data.skill])
      setNewSkill("")
    } catch (e: any) {
      setSkillsError(e?.response?.data?.detail || "Your resume doesn't contain this skill.")
    }
  }

  const handleSaveSkills = async () => {
    setSkillsSaving(true)
    setSkillsError("")
    setSkillsSuccess("")
    try {
      const data = await candidateService.updateParsedSkills(parsedSkills)
      setParsedSkills(Array.isArray(data.skills) ? data.skills : [])
      setSkillsSuccess("Skills saved successfully!")
      setTimeout(() => setSkillsSuccess(""), 3000)
    } catch (e: any) {
      setSkillsError(e?.response?.data?.detail || "Failed to save skills.")
    } finally {
      setSkillsSaving(false)
    }
  }

  const handleRedoSetup = () => {
    removeSessionValue("profile_complete")
    router.push("/setup")
  }

  const initials = form.full_name
    ? form.full_name.split(" ").map(n => n[0]).join("").toUpperCase()
    : "?"

  if (checking || !authorized || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingBackButton onClick={() => router.back()} />

      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="pl-20 sm:pl-24">
          <h1 className="font-semibold text-foreground">My Profile</h1>
          <p className="text-xs text-muted-foreground">Manage your personal information</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:space-y-6 sm:p-6">

        {/* Success / Error */}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
            <CheckCircle2 className="h-4 w-4" /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
            <AlertCircle className="h-4 w-4" /> {error}
            <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-300">✕</button>
          </div>
        )}

        {/* Avatar + account info */}
        <Card className="bg-card border-border py-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="relative">
                <Avatar className="h-24 w-24 border-2 border-border">
                  {avatarUrl
                    ? <AvatarImage src={avatarUrl} alt={form.full_name} />
                    : null
                  }
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center
                    border-2 border-background hover:bg-primary/90 transition-colors"
                >
                  {uploading
                    ? <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                    : <Camera className="h-3.5 w-3.5 text-primary-foreground" />
                  }
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>

              <div className="flex-1 text-center sm:text-left space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{form.full_name || "Your Name"}</h2>
                <p className="text-sm text-muted-foreground">{email}</p>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                  <Badge className="bg-primary/10 text-primary border-0 text-xs">Candidate</Badge>
                  {joinedAt && (
                    <span className="text-xs text-muted-foreground">Joined {joinedAt}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Info */}
        <ResponsiveSectionCard
          title="Personal Information"
          icon={User}
          isMobile={isMobile}
          defaultOpen
          contentClassName="space-y-4"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TooltipWrapper content="Your full legal name as it appears on official documents.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Full Name</Label>
                  <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="John Doe" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Your primary contact number with country code.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Phone</Label>
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="+91 9876543210" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Your current or completed degree. e.g. B.Tech, MCA.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Degree</Label>
                  <Input value={form.degree} onChange={e => setForm(p => ({ ...p, degree: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="B.Tech" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Your branch or specialization. e.g. Computer Science.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Branch</Label>
                  <Input value={form.branch} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="Computer Science" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Name of your college or university.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">College</Label>
                  <Input value={form.college} onChange={e => setForm(p => ({ ...p, college: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="IIT Bombay" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Year you completed or expect to complete your degree.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Passout Year</Label>
                  <Input type="number" value={form.passout_year} onChange={e => setForm(p => ({ ...p, passout_year: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="2025" />
                </div>
              </TooltipWrapper>
            </div>
        </ResponsiveSectionCard>

        {/* Education */}
        <ResponsiveSectionCard
          title="Education Details"
          icon={GraduationCap}
          isMobile={isMobile}
          contentClassName="space-y-4"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TooltipWrapper content="Your CGPA on a 10-point scale. Used for job hard filter checks.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">CGPA (out of 10)</Label>
                  <Input type="number" step="0.01" min={0} max={10}
                    value={form.cgpa} onChange={e => setForm(p => ({ ...p, cgpa: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="8.5" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Auto-calculated using CGPA × 9.5 formula.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">
                    Equivalent % <span className="text-xs text-primary">(auto)</span>
                  </Label>
                  <Input readOnly value={form.cgpa ? cgpaToPercentage(parseFloat(form.cgpa)).toFixed(2) : ""}
                    className="bg-input border-border text-muted-foreground cursor-not-allowed" placeholder="Auto-filled" />
                </div>
              </TooltipWrapper>
            </div>

            {/* Gap */}
            <TooltipWrapper content="Toggle if you have any gap in your education or work history.">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Education / Employment Gap</p>
                  <p className="text-xs text-muted-foreground">Do you have any gap?</p>
                </div>
                <Switch checked={form.has_gap} onCheckedChange={v => setForm(p => ({ ...p, has_gap: v }))} />
              </div>
            </TooltipWrapper>

            {form.has_gap && (
              <TooltipWrapper content="Total duration of your gap in months.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Gap Duration (months)</Label>
                  <Input type="number" min={1} value={form.gap_duration_months}
                    onChange={e => setForm(p => ({ ...p, gap_duration_months: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="6" />
                </div>
              </TooltipWrapper>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TooltipWrapper content="Number of subjects you currently have pending (active backlogs).">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Active Backlogs</Label>
                  <Input type="number" min={0} value={form.active_backlogs}
                    onChange={e => setForm(p => ({ ...p, active_backlogs: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="0" />
                </div>
              </TooltipWrapper>
              <TooltipWrapper content="Total backlogs including cleared ones throughout your academic career.">
                <div className="space-y-2">
                  <Label className="text-foreground text-sm">Total Backlogs (incl. cleared)</Label>
                  <Input type="number" min={0} value={form.total_backlogs}
                    onChange={e => setForm(p => ({ ...p, total_backlogs: e.target.value }))}
                    className="bg-input border-border text-foreground" placeholder="0" />
                </div>
              </TooltipWrapper>
            </div>
        </ResponsiveSectionCard>

        {/* Resume management */}
        <ResponsiveSectionCard
          title="Resume"
          description="Re-uploading will delete your current resume and re-extract your skills."
          icon={FileText}
          isMobile={isMobile}
          contentClassName="space-y-4"
        >
            {resumeSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
                <CheckCircle2 className="h-4 w-4" /> {resumeSuccess}
              </div>
            )}
            <input ref={resumeInputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png"
              className="hidden" onChange={handleResumeReupload} />
            <Button variant="outline" onClick={() => resumeInputRef.current?.click()}
              disabled={resumeUploading}
              className="border-border text-foreground hover:bg-secondary w-full sm:w-auto">
              {resumeUploading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                : <><Upload className="h-4 w-4 mr-2" /> Re-upload Resume</>
              }
            </Button>
            <p className="text-xs text-muted-foreground">
              Supports PDF, DOCX, JPG, PNG · Max 5MB · Previous resume will be automatically deleted
            </p>
        </ResponsiveSectionCard>

        <ResponsiveSectionCard
          title="Extracted Skills"
          description="These come from your resume. You can remove skills, or add only skills that are actually present in your resume."
          icon={Sparkles}
          isMobile={isMobile}
          contentClassName="space-y-4"
        >
            {skillsSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
                <CheckCircle2 className="h-4 w-4" /> {skillsSuccess}
              </div>
            )}
            {skillsError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                <AlertCircle className="h-4 w-4" /> {skillsError}
              </div>
            )}
            <div className="flex flex-wrap gap-2 min-h-[60px] rounded-lg bg-secondary/30 p-3">
              {skillsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading skills...
                </div>
              ) : parsedSkills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No extracted skills found yet.</p>
              ) : (
                parsedSkills.map(skill => (
                  <Badge key={skill} className="bg-primary/10 text-primary border-0 pr-1">
                    {skill}
                    <button
                      onClick={() => {
                        setParsedSkills(current => current.filter(item => item !== skill))
                        setSkillsError("")
                        setSkillsSuccess("")
                      }}
                      className="ml-2 hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSkill}
                onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleAddSkill()
                  }
                }}
                className="bg-input border-border text-foreground"
                placeholder="Add a skill from your resume..."
              />
              <Button type="button" variant="outline" onClick={() => void handleAddSkill()}
                className="border-border text-foreground hover:bg-secondary">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={handleSaveSkills} disabled={skillsSaving || skillsLoading}
              className="w-full sm:w-auto bg-primary text-primary-foreground">
              {skillsSaving
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving Skills...</>
                : <><Save className="h-4 w-4 mr-2" /> Save Skills</>
              }
            </Button>
        </ResponsiveSectionCard>

        {/* Redo setup */}
        <Card className="bg-card border-border border-l-4 border-l-yellow-500">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-yellow-500" /> Redo Profile Setup
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Start the 5-step setup from scratch. Your existing data will be preserved.
              </p>
            </div>
            <Button variant="outline" onClick={handleRedoSetup}
              className="border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10 shrink-0">
              <RefreshCw className="h-4 w-4 mr-2" /> Start Over
            </Button>
          </CardContent>
        </Card>

        {/* Save button */}
        <Button onClick={handleSave} disabled={saving}
          className="w-full bg-primary text-primary-foreground">
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
            : <><Save className="h-4 w-4 mr-2" /> Save Profile</>
          }
        </Button>
      </div>
    </div>
  )
}
