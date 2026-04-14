"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper"
import { FloatingBackButton } from "@/components/ui/floating-back-button"
import { candidateService } from "@/lib/candidateService"
import { authService } from "@/lib/authService"
import { cgpaToPercentage, isPercentageValid, formatFileSize, cn } from "@/lib/utils"
import {
  User, Phone, GraduationCap, AlertCircle,
  Upload, CheckCircle2, X, Plus, ArrowRight,
  Sparkles, FileText, RefreshCw, Loader2
} from "lucide-react"

const STEPS = ["Personal Info", "Education", "Gap & Backlogs", "Resume Upload", "Skills Review"]

const TOOLTIPS = {
  full_name: "Enter your full legal name as it appears on your official documents.",
  phone: "Your primary contact number with country code. Example: +91 9876543210.",
  tenth: "Your Class 10 board exam percentage. Enter a value between 0 and 100.",
  twelfth: "Your Class 12 board exam percentage. Enter a value between 0 and 100.",
  cgpa: "Your current CGPA on a 10-point scale. We'll automatically calculate the equivalent percentage using CGPA × 9.5.",
  cgpa_percent: "This is automatically calculated from your CGPA using the formula: CGPA × 9.5. You can adjust it manually, but it cannot exceed the calculated value by more than 2%.",
  degree: "Your current or completed degree. Example: B.Tech, BCA, MCA, MBA.",
  branch: "Your specialization or branch. Example: Computer Science, Information Technology.",
  college: "Name of your college or university.",
  passout_year: "The year you completed or expect to complete your degree.",
  has_gap: "Select Yes if you have any gap in your education or employment history.",
  gap_months: "Total duration of your education or employment gap in months.",
  active_backlogs: "Number of subjects you currently have pending (active backlogs).",
  total_backlogs: "Total number of backlogs you have had throughout your academic career, including cleared ones.",
  resume: "Upload your resume in PDF, DOCX, JPG, or PNG format. Maximum file size: 5MB. Our AI will extract your skills automatically.",
  skills: "These skills were automatically extracted from your resume by our AI system. You can add any missing skills or remove incorrect ones before proceeding.",
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]
const MAX_SIZE = 5 * 1024 * 1024

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Step 1 — Personal
  const [personal, setPersonal] = useState({
    full_name: "", phone: "", degree: "", branch: "", college: "", passout_year: "",
  })

  // Step 2 — Education
  const [edu, setEdu] = useState({
    tenth_percentage: "",
    twelfth_percentage: "",
    cgpa: "",
    cgpa_percentage: "",
  })
  const [cgpaError, setCgpaError] = useState("")

  // Step 3 — Gap & Backlogs
  const [gaps, setGaps] = useState({
    has_gap: false,
    gap_duration_months: "",
    active_backlogs: "",
    total_backlogs: "",
  })

  // Step 4 — Resume
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState("")
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [polling, setPolling] = useState(false)

  // Step 5 — Skills
  const [skills, setSkills] = useState<string[]>([])
  const [newSkill, setNewSkill] = useState("")
  const [skillsStatus, setSkillsStatus] = useState<"loading" | "done" | "manual">("loading")
  const [skillsSaving, setSkillsSaving] = useState(false)
  const [skillsError, setSkillsError] = useState("")

  // Auto-calculate CGPA → percentage
  useEffect(() => {
    if (edu.cgpa) {
      const val = parseFloat(edu.cgpa)
      if (!isNaN(val) && val >= 0 && val <= 10) {
        const pct = cgpaToPercentage(val)
        setEdu(prev => ({ ...prev, cgpa_percentage: pct.toString() }))
        setCgpaError("")
      }
    }
  }, [edu.cgpa])

  // Validate manual percentage override
  const handlePercentageChange = (val: string) => {
    setEdu(prev => ({ ...prev, cgpa_percentage: val }))
    if (edu.cgpa && val) {
      const cgpa = parseFloat(edu.cgpa)
      const pct = parseFloat(val)
      if (!isNaN(cgpa) && !isNaN(pct)) {
        if (!isPercentageValid(cgpa, pct)) {
          setCgpaError(`Percentage cannot exceed ${cgpaToPercentage(cgpa) + 2}% for CGPA of ${cgpa}`)
        } else {
          setCgpaError("")
        }
      }
    }
  }

  // Poll for parsed skills after resume upload
  const pollForSkills = useCallback(async () => {
    setPolling(true)
    let attempts = 0
    const maxAttempts = 20 // 20 × 3s = 60s timeout

    const check = async () => {
      try {
        const data = await candidateService.getParsedSkills()
        if (data.status === "done") {
          setSkills(data.skills || [])
          setSkillsStatus((data.skills?.length ?? 0) > 0 ? "done" : "manual")
          setPolling(false)
        } else if (attempts >= maxAttempts) {
          // Timeout — show manual entry
          setSkillsStatus("manual")
          setPolling(false)
        } else {
          attempts++
          setTimeout(check, 3000)
        }
      } catch {
        setSkillsStatus("manual")
        setPolling(false)
      }
    }
    check()
  }, [])

  const handleFileSelect = (f: File) => {
    setFileError("")
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError("Only PDF, DOCX, JPG, and PNG files are allowed.")
      return
    }
    if (f.size > MAX_SIZE) {
      setFileError("File size must be under 5MB.")
      return
    }
    setFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setUploadError("")
    try {
      await candidateService.uploadResume(file)
      setUploadDone(true)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Upload failed. Please try again."
      setUploadError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSkill = async () => {
    const rawSkill = newSkill.trim()
    if (!rawSkill) return
    if (skills.some(skill => skill.toLowerCase() === rawSkill.toLowerCase())) {
      setNewSkill("")
      setSkillsError("")
      return
    }

    setSkillsError("")
    try {
      const data = await candidateService.validateParsedSkill(rawSkill)
      setSkills(current => [...current, data.skill])
      setNewSkill("")
    } catch (e: any) {
      setSkillsError(e?.response?.data?.detail || "Your resume doesn't contain this skill.")
    }
  }

  const handleNext = async () => {
    setError("")

    // Step 0 — Personal validation
    if (step === 0) {
      if (!personal.full_name.trim()) return setError("Full name is required.")
      if (!personal.phone.trim()) return setError("Phone number is required.")
    }

    // Step 1 — Education: save profile
    if (step === 1) {
      if (!edu.tenth_percentage) return setError("10th percentage is required.")
      if (!edu.twelfth_percentage) return setError("12th percentage is required.")
      if (!edu.cgpa) return setError("CGPA is required.")
      if (cgpaError) return setError(cgpaError)

      setLoading(true)
      try {
        await candidateService.updateProfile({
          full_name: personal.full_name,
          phone: personal.phone,
          degree: personal.degree || undefined,
          branch: personal.branch || undefined,
          college: personal.college || undefined,
          tenth_percentage: parseFloat(edu.tenth_percentage),
          twelfth_percentage: parseFloat(edu.twelfth_percentage),
          passout_year: personal.passout_year ? parseInt(personal.passout_year) : undefined,
          cgpa: parseFloat(edu.cgpa),
        })
      } catch {
        setLoading(false)
        return setError("Failed to save profile. Please try again.")
      }
      setLoading(false)
    }

    // Step 2 — Gap: save
    if (step === 2) {
      setLoading(true)
      try {
        await candidateService.updateProfile({
          has_gap: gaps.has_gap,
          gap_duration_months: gaps.has_gap ? parseInt(gaps.gap_duration_months || "0") : 0,
          active_backlogs: parseInt(gaps.active_backlogs || "0"),
          total_backlogs: parseInt(gaps.total_backlogs || "0"),
        })
      } catch {
        setLoading(false)
        return setError("Failed to save. Please try again.")
      }
      setLoading(false)
    }

    // Step 3 — Resume must be uploaded
    if (step === 3) {
      if (!uploadDone) return setError("Please upload your resume before continuing.")
      // Move to skills and start polling
      setStep(4)
      pollForSkills()
      return
    }

    // Step 4 — Skills: done
    if (step === 4) {
      if (skills.length === 0) return setError("Add at least one skill before going to dashboard.")

      setLoading(true)
      setSkillsSaving(true)
      setSkillsError("")
      try {
        await candidateService.updateParsedSkills(skills)
        authService.markProfileComplete()
        router.replace("/candidate")
        return
      } catch (e: any) {
        setSkillsError(e?.response?.data?.detail || "Failed to save skills. Please try again.")
      } finally {
        setLoading(false)
        setSkillsSaving(false)
      }
      return
    }

    setStep(s => s + 1)
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {step > 0 && (
        <FloatingBackButton
          onClick={() => { setStep(s => s - 1); setError("") }}
          disabled={loading}
        />
      )}

      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">TRIPLET</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Complete Your Profile</h1>
          <p className="text-muted-foreground mt-1">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <span key={s} className={cn(
                "text-xs hidden sm:block",
                i === step ? "text-primary font-medium" : "text-muted-foreground"
              )}>{s}</span>
            ))}
          </div>
        </div>

        {/* Card */}
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-5">

            {/* ── STEP 0: Personal Info ── */}
            {step === 0 && (
              <div className="space-y-4">
                <TooltipWrapper content={TOOLTIPS.full_name}>
                  <div className="space-y-2">
                    <Label className="text-foreground">Full Name *</Label>
                    <Input
                      value={personal.full_name}
                      onChange={e => setPersonal(p => ({ ...p, full_name: e.target.value }))}
                      placeholder="John Doe"
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </TooltipWrapper>

                <TooltipWrapper content={TOOLTIPS.phone}>
                  <div className="space-y-2">
                    <Label className="text-foreground">Phone Number *</Label>
                    <Input
                      value={personal.phone}
                      onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+91 9876543210"
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </TooltipWrapper>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TooltipWrapper content={TOOLTIPS.degree}>
                    <div className="space-y-2">
                      <Label className="text-foreground">Degree</Label>
                      <Input
                        value={personal.degree}
                        onChange={e => setPersonal(p => ({ ...p, degree: e.target.value }))}
                        placeholder="B.Tech / BCA / MCA"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>

                  <TooltipWrapper content={TOOLTIPS.branch}>
                    <div className="space-y-2">
                      <Label className="text-foreground">Branch / Specialization</Label>
                      <Input
                        value={personal.branch}
                        onChange={e => setPersonal(p => ({ ...p, branch: e.target.value }))}
                        placeholder="Computer Science"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>
                </div>

                <TooltipWrapper content={TOOLTIPS.college}>
                  <div className="space-y-2">
                    <Label className="text-foreground">College / University</Label>
                    <Input
                      value={personal.college}
                      onChange={e => setPersonal(p => ({ ...p, college: e.target.value }))}
                      placeholder="IIT Bombay / Mumbai University"
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </TooltipWrapper>

                <TooltipWrapper content={TOOLTIPS.passout_year}>
                  <div className="space-y-2">
                    <Label className="text-foreground">Passout Year</Label>
                    <Input
                      type="number"
                      value={personal.passout_year}
                      onChange={e => setPersonal(p => ({ ...p, passout_year: e.target.value }))}
                      placeholder="2025"
                      min={1990} max={2100}
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </TooltipWrapper>
              </div>
            )}

            {/* ── STEP 1: Education ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TooltipWrapper content={TOOLTIPS.tenth}>
                    <div className="space-y-2">
                      <Label className="text-foreground">10th Percentage *</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={edu.tenth_percentage}
                        onChange={e => setEdu(p => ({ ...p, tenth_percentage: e.target.value }))}
                        placeholder="85.5"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>

                  <TooltipWrapper content={TOOLTIPS.twelfth}>
                    <div className="space-y-2">
                      <Label className="text-foreground">12th Percentage *</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={edu.twelfth_percentage}
                        onChange={e => setEdu(p => ({ ...p, twelfth_percentage: e.target.value }))}
                        placeholder="78.0"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>
                </div>

                <div className="p-4 rounded-lg bg-secondary/30 space-y-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Current / Graduation CGPA
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TooltipWrapper content={TOOLTIPS.cgpa}>
                      <div className="space-y-2">
                        <Label className="text-foreground">CGPA (out of 10) *</Label>
                        <Input
                          type="number" min={0} max={10} step={0.01}
                          value={edu.cgpa}
                          onChange={e => setEdu(p => ({ ...p, cgpa: e.target.value }))}
                          placeholder="8.5"
                          className="bg-input border-border text-foreground"
                        />
                      </div>
                    </TooltipWrapper>

                    <TooltipWrapper content={TOOLTIPS.cgpa_percent}>
                      <div className="space-y-2">
                        <Label className="text-foreground">
                          Equivalent % 
                          <span className="text-xs text-primary ml-1">(auto-calculated)</span>
                        </Label>
                        <Input
                          type="number" min={0} max={100} step={0.01}
                          value={edu.cgpa_percentage}
                          onChange={e => handlePercentageChange(e.target.value)}
                          placeholder="80.75"
                          className={cn(
                            "bg-input border-border text-foreground",
                            cgpaError && "border-red-500"
                          )}
                        />
                      </div>
                    </TooltipWrapper>
                  </div>
                  {cgpaError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {cgpaError}
                    </p>
                  )}
                  {edu.cgpa && !cgpaError && (
                    <p className="text-xs text-primary flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      CGPA {edu.cgpa} = {cgpaToPercentage(parseFloat(edu.cgpa))}% (CGPA × 9.5)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: Gap & Backlogs ── */}
            {step === 2 && (
              <div className="space-y-5">
                <TooltipWrapper content={TOOLTIPS.has_gap}>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                    <div>
                      <p className="font-medium text-foreground">Education / Employment Gap</p>
                      <p className="text-sm text-muted-foreground">Do you have any gap in your history?</p>
                    </div>
                    <Switch
                      checked={gaps.has_gap}
                      onCheckedChange={v => setGaps(p => ({ ...p, has_gap: v }))}
                    />
                  </div>
                </TooltipWrapper>

                {gaps.has_gap && (
                  <TooltipWrapper content={TOOLTIPS.gap_months}>
                    <div className="space-y-2">
                      <Label className="text-foreground">Gap Duration (months)</Label>
                      <Input
                        type="number" min={1}
                        value={gaps.gap_duration_months}
                        onChange={e => setGaps(p => ({ ...p, gap_duration_months: e.target.value }))}
                        placeholder="6"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TooltipWrapper content={TOOLTIPS.active_backlogs}>
                    <div className="space-y-2">
                      <Label className="text-foreground">Active Backlogs</Label>
                      <Input
                        type="number" min={0}
                        value={gaps.active_backlogs}
                        onChange={e => setGaps(p => ({ ...p, active_backlogs: e.target.value }))}
                        placeholder="0"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>

                  <TooltipWrapper content={TOOLTIPS.total_backlogs}>
                    <div className="space-y-2">
                      <Label className="text-foreground">Total Backlogs (including cleared)</Label>
                      <Input
                        type="number" min={0}
                        value={gaps.total_backlogs}
                        onChange={e => setGaps(p => ({ ...p, total_backlogs: e.target.value }))}
                        placeholder="0"
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                  </TooltipWrapper>
                </div>
              </div>
            )}

            {/* ── STEP 3: Resume Upload ── */}
            {step === 3 && (
              <div className="space-y-4">
                <TooltipWrapper content={TOOLTIPS.resume}>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                      file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/50"
                    )}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      const f = e.dataTransfer.files[0]
                      if (f) handleFileSelect(f)
                    }}
                    onClick={() => document.getElementById("resume-input")?.click()}
                  >
                    <input
                      id="resume-input"
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.jpg,.jpeg,.png"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                    />
                    {file ? (
                      <div className="space-y-2">
                        <FileText className="h-10 w-10 text-primary mx-auto" />
                        <p className="font-medium text-foreground">{file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={e => { e.stopPropagation(); setFile(null); setUploadDone(false); setUploadError("") }}
                          className="border-border"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Change file
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
                        <p className="font-medium text-foreground">Drop your resume here</p>
                        <p className="text-sm text-muted-foreground">PDF, DOCX, JPG, PNG · Max 5MB</p>
                      </div>
                    )}
                  </div>
                </TooltipWrapper>

                {fileError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {fileError}
                  </div>
                )}

                {uploadError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {uploadError}
                    <button className="underline ml-1" onClick={() => { setUploadError(""); setFile(null) }}>
                      Try again
                    </button>
                  </div>
                )}

                {file && !uploadDone && (
                  <Button
                    onClick={handleUpload}
                    disabled={loading}
                    className="w-full bg-primary text-primary-foreground"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {loading ? "Uploading..." : "Upload Resume"}
                  </Button>
                )}

                {uploadDone && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-500 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Resume uploaded successfully! Our AI is extracting your skills.
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 4: Skills Review ── */}
            {step === 4 && (
              <div className="space-y-4">
                {skillsStatus === "loading" && (
                  <div className="text-center py-8 space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-foreground font-medium">AI is extracting your skills...</p>
                    <p className="text-sm text-muted-foreground">This usually takes 10–30 seconds</p>
                  </div>
                )}

                {(skillsStatus === "done" || skillsStatus === "manual") && (
                  <TooltipWrapper content={TOOLTIPS.skills}>
                    <div className="space-y-4">
                      {skillsStatus === "done" ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm">
                          <Sparkles className="h-4 w-4" />
                          AI extracted {skills.length} skills from your resume. Review and adjust below.
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          Could not auto-extract skills. Please add them manually below.
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 min-h-[60px] p-3 rounded-lg bg-secondary/30">
                        {skills.length === 0 && (
                          <p className="text-sm text-muted-foreground">No skills added yet.</p>
                        )}
                        {skills.map(skill => (
                          <Badge key={skill} className="bg-primary/10 text-primary border-0 pr-1">
                            {skill}
                            <button
                              onClick={() => {
                                setSkills(s => s.filter(x => x !== skill))
                                setSkillsError("")
                              }}
                              className="ml-2 hover:text-red-400"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
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
                          placeholder="Add a skill and press Enter..."
                          className="bg-input border-border text-foreground"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleAddSkill()}
                          className="border-border"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {skillsError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          {skillsError}
                        </div>
                      )}
                    </div>
                  </TooltipWrapper>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                <AlertCircle className="h-4 w-4" /> {error}
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleNext}
                className="flex-1 bg-primary text-primary-foreground"
                disabled={loading || (step === 4 && skillsStatus === "loading")}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {step === 4
                  ? skillsSaving ? "Saving Skills..." : "Go to Dashboard"
                  : step === 3 && uploadDone
                  ? "Next — Review Skills"
                  : "Next"}
                {step < 4 && !loading && <ArrowRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
