"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { authService } from "@/lib/authService"
import { candidateService } from "@/lib/candidateService"
import { removeSessionValue } from "@/lib/browser-session"
import { applyTheme, resolveStoredTheme } from "@/lib/theme"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { PasswordStrengthMeter } from "@/components/ui/password-strength"
import { evaluatePassword } from "@/lib/password-policy"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  UserPlus,
  Users,
} from "lucide-react"

import {
  FeatureCard,
  LoginForm,
  findUnverifiedEmailDetail,
  getAuthErrorDetail,
  getDetailMessage,
  persistPendingOtp,
  readPendingOtp,
} from "./shared"
export default function LoginPage() {
  const router = useRouter()
  const aboutSectionRef = useRef<HTMLDivElement | null>(null)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"candidate" | "hr">("candidate")
  const [isSignupOpen, setIsSignupOpen] = useState(false)
  const [signupRole, setSignupRole] = useState<"candidate" | "hr">("candidate")
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form")
  const [error, setError] = useState("")
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  // OTP state (shared between login OTP and signup email verification)
  const [otpStep, setOtpStep] = useState(false)
  const [otpMode, setOtpMode] = useState<"login" | "signup">("login")
  const [otpEmail, setOtpEmail] = useState("")
  const [otpValue, setOtpValue] = useState("")
  const [otpError, setOtpError] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loginError, setLoginError] = useState("")

  // Controlled signup password state so we can show the live strength meter.
  const [signupPassword, setSignupPassword] = useState("")
  const signupPasswordStrength = evaluatePassword(signupPassword)

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState("")

  const openOtpStep = useCallback((mode: "login" | "signup", email: string, expiresIn: number) => {
    setOtpMode(mode)
    setOtpEmail(email)
    setOtpValue("")
    setOtpError("")
    setError("")
    setLoginError("")
    if (mode === "signup") {
      setSignupStep("verify")
      setIsSignupOpen(true)
      setOtpStep(false)
    } else {
      setOtpStep(true)
    }
    setCountdown(expiresIn)
    persistPendingOtp({
      mode,
      email,
      expires_at: Date.now() + (expiresIn * 1000),
    })
  }, [])

  const closeOtpStep = useCallback(() => {
    if (otpMode === "signup") {
      setIsSignupOpen(false)
      setSignupStep("form")
    } else {
      setOtpStep(false)
    }
    setOtpValue("")
    setOtpError("")
    setError("")
    setLoginError("")
    persistPendingOtp(null)
  }, [otpMode])

  // OTP login flow
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError("")
    setOtpError("")

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const response = await authService.login({ email, password })
      setLoginError("")
      setError("")
      openOtpStep("login", email, response.expires_in)
    } catch (err: any) {
      const responsePayload = getAuthErrorDetail(err)
      const detail = responsePayload
      const unverifiedDetail = findUnverifiedEmailDetail(err)
      // Backend signals unverified accounts with a structured detail and
      // re-issues a signup OTP server-side — drop the user straight into
      // the verify-email step instead of showing a generic error.
      if (unverifiedDetail || getDetailMessage(detail)?.toLowerCase().includes("verify your email")) {
        setError("")
        openOtpStep("signup", unverifiedDetail?.email || email, unverifiedDetail?.expires_in || 240)
      } else {
        setLoginError(
          (typeof detail === "string" ? detail : null) ||
            getDetailMessage(detail) ||
            "Login failed. Please try again.",
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpSubmit = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Please enter the 6-digit code.")
      return
    }
    setOtpLoading(true)
    setOtpError("")
    try {
      const data = otpMode === "signup"
        ? await authService.verifySignup(otpEmail, otpValue)
        : await authService.verifyOtp(otpEmail, otpValue)
      persistPendingOtp(null)
      const me = await authService.getMe()
      sessionStorage.setItem("userName", me.email.split("@")[0])
      sessionStorage.setItem("userEmail", me.email)

      if (data.role === "candidate") {
        const [profileResult, skillsResult] = await Promise.allSettled([
          candidateService.getProfile(),
          candidateService.getParsedSkills(),
        ])

        const profile = profileResult.status === "fulfilled"
          ? profileResult.value as {
              phone?: string | null
              tenth_percentage?: number | null
              twelfth_percentage?: number | null
              cgpa?: number | null
            }
          : null

        const skills = skillsResult.status === "fulfilled" && skillsResult.value.status === "done"
          ? skillsResult.value.skills
          : []

        const profileDone = Boolean(
          profile?.phone &&
          profile?.tenth_percentage != null &&
          profile?.twelfth_percentage != null &&
          profile?.cgpa != null &&
          skills.length > 0
        )

        if (profileDone) authService.markProfileComplete()
        else removeSessionValue("profile_complete")

        router.push(profileDone ? "/candidate" : "/setup")
      } else {
        router.push("/hr")
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setOtpError(
        (typeof detail === "string" ? detail : detail?.message) ||
          "Invalid code. Please try again.",
      )
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResendOtp = async () => {
    try {
      const response = otpMode === "signup"
        ? await authService.resendSignupOtp(otpEmail)
        : await authService.resendOtp(otpEmail)
      setCountdown(response.expires_in)
      setOtpError("")
      persistPendingOtp({
        mode: otpMode,
        email: otpEmail,
        expires_at: Date.now() + (response.expires_in * 1000),
      })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setOtpError(
        (typeof detail === "string" ? detail : detail?.message) ||
          "Could not resend code.",
      )
    }
  }

  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  useEffect(() => {
    const pending = readPendingOtp()
    if (!pending) return
    setOtpMode(pending.mode)
    setOtpEmail(pending.email)
    setOtpValue("")
    setOtpError("")
    setError("")
    setLoginError("")
    if (pending.mode === "signup") {
      setSignupStep("verify")
      setIsSignupOpen(true)
      setOtpStep(false)
    } else {
      setOtpStep(true)
    }
    setCountdown(Math.max(0, Math.ceil((pending.expires_at - Date.now()) / 1000)))
  }, [])

  useEffect(() => {
    if (!otpStep && otpMode !== "signup") return
    setLoginError("")
  }, [otpMode, otpStep])

  useEffect(() => {
    const resolved = resolveStoredTheme("/", (key) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    })
    setTheme(resolved)
    applyTheme(resolved)
  }, [])

  const toggleLoginTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    try {
      localStorage.setItem("triplet_theme", next)
    } catch {}
    applyTheme(next)
  }

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    const formData = new FormData(e.currentTarget)
    const password = signupPassword || (formData.get("password") as string)
    const confirm = formData.get("confirmPassword") as string
    const email = formData.get("email") as string

    if (password !== confirm) {
      setError("Passwords do not match.")
      setIsLoading(false)
      return
    }
    if (!signupPasswordStrength.isStrong) {
      setError("Please choose a password that meets every requirement below.")
      setIsLoading(false)
      return
    }

    try {
      let response: { expires_in?: number | null }
      if (signupRole === "candidate") {
        response = await authService.registerCandidate({
          email,
          password,
          full_name: `${formData.get("firstName") || ""} ${formData.get("lastName") || ""}`,
        })
      } else {
        response = await authService.registerEmployer({
          email,
          password,
          company_name: formData.get("company") as string || "My Company",
        })
      }
      setSignupPassword("")
      openOtpStep("signup", email, response.expires_in ?? 240)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      setError(
        (typeof detail === "string" ? detail : detail?.message) ||
          (Array.isArray(detail) ? detail[0]?.msg : null) ||
          "Registration failed. Please try again.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  const openSignup = (role: "candidate" | "hr") => {
    setSignupRole(role)
    setIsSignupOpen(true)
    setSignupStep("form")
    setSignupPassword("")
    setError("")
    setOtpError("")
    setOtpValue("")
  }

  const handleSignupDialogChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setIsSignupOpen(true)
      return
    }
    setIsSignupOpen(false)
    setSignupStep("form")
    setSignupPassword("")
    setOtpValue("")
    setOtpError("")
    setError("")
    persistPendingOtp(null)
  }

  const scrollToAbout = () => {
    aboutSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  const safeCountdown = Math.max(countdown, 0)
  const formattedCountdown = `${Math.floor(safeCountdown / 60)}:${String(safeCountdown % 60).padStart(2, "0")}`

  return (
    <div className="min-h-screen overflow-x-hidden bg-background xl:grid xl:grid-cols-[1.08fr_0.92fr]">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={toggleLoginTheme}
        className="fixed right-4 top-4 z-40 h-10 w-10 rounded-xl border-border/80 bg-card/90 text-muted-foreground shadow-sm backdrop-blur-md hover:text-foreground"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Left Panel - Branding */}
      <div className="relative hidden overflow-hidden border-r border-border/80 bg-card/78 backdrop-blur-sm xl:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(15,185,129,0.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.4),rgba(236,243,249,0.72))] dark:bg-[linear-gradient(180deg,rgba(20,28,35,0.2),rgba(20,28,35,0.7))]" />
        <div className="absolute inset-y-0 right-0 w-px bg-border/70" />
        <div className="relative z-10 flex w-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="block text-2xl font-bold tracking-[0.16em] text-foreground">TRIPLET</span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">AI Hiring Platform</span>
            </div>
          </div>

          <div className="space-y-10">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Intelligent hiring workflow
            </div>
            <h1 className="max-w-xl text-5xl font-bold leading-[1.02] text-foreground text-balance">
              Hire faster.
              <br />
              <span className="text-primary">Hire smarter.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Transform your recruitment with AI-driven resume screening,
              intelligent candidate ranking, and seamless job management.
            </p>
            
            <div className="grid grid-cols-2 gap-5 pt-4">
              <FeatureCard 
                icon={<Users className="h-5 w-5" />}
                title="For Candidates"
                description="Browse jobs and track applications"
              />
              <FeatureCard 
                icon={<Briefcase className="h-5 w-5" />}
                title="For HR Teams"
                description="AI-powered candidate ranking"
              />
            </div>

          </div>

          <div className="rounded-[1.75rem] border border-border/80 bg-card/76 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.08)] backdrop-blur-md dark:bg-background/82">
            <p className="text-sm font-medium text-foreground">
              Built for modern hiring teams that want speed without losing judgment.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Review candidates, collaborate with hiring teams, and keep applicants informed from one polished workspace.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="relative flex justify-center px-4 pb-10 pt-16 sm:px-6 lg:p-10 xl:items-center">
        <div className="w-full max-w-lg space-y-5 sm:space-y-7">
          {/* Mobile Logo */}
          <div className="flex items-center justify-center gap-3 px-1 xl:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="block text-2xl font-bold tracking-[0.16em] text-foreground">TRIPLET</span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">AI Hiring Platform</span>
            </div>
          </div>
          <div className="space-y-3 px-1 text-center xl:hidden">
            <h1 className="text-balance text-3xl font-bold leading-[1.02] tracking-[-0.04em] text-foreground">
              Hire faster.
              <br />
              <span className="text-primary">Hire smarter.</span>
            </h1>
            <p className="mx-auto max-w-md text-balance text-sm leading-relaxed text-muted-foreground">
              Transform your recruitment with AI-driven resume screening, intelligent candidate ranking, and seamless job management.
            </p>
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={scrollToAbout}
                className="group h-10 rounded-full border-border/70 bg-card/82 px-4 text-[12.5px] font-semibold text-foreground/88 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/6 hover:text-foreground"
              >
                About Triplet
                <ArrowDown className="ml-2 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-y-0.5 motion-safe:animate-bounce" />
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border/80 bg-card/84 p-5 shadow-[0_20px_44px_rgba(15,23,42,0.1)] backdrop-blur-md dark:bg-card/94 sm:p-8">
          <div className="text-center xl:text-left">
            <div className="inline-flex items-center rounded-full border border-border/80 bg-secondary/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Secure workspace access
            </div>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-foreground">Welcome back</h2>
            <p className="mt-2 text-muted-foreground">Sign in to continue to your dashboard</p>
            {!otpStep && loginError && (
              <div className="text-destructive text-sm text-center mt-2">{loginError}</div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "candidate" | "hr")} className="mt-7 w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="candidate"
                className="data-[state=active]:!text-[#04241c] data-[state=active]:[&_svg]:!text-[#04241c]"
              >
                <Users className="h-4 w-4 mr-2" />
                Candidate
              </TabsTrigger>
              <TabsTrigger
                value="hr"
                className="data-[state=active]:!text-[#04241c] data-[state=active]:[&_svg]:!text-[#04241c]"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                HR Manager
              </TabsTrigger>
            </TabsList>

            <TabsContent value="candidate" className="mt-6">
              <LoginForm 
                role="candidate"
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                isLoading={isLoading}
                error={error}
                onSubmit={handleLogin}
                onSignupClick={() => openSignup("candidate")}
                onForgotPasswordClick={() => {
                  setForgotOpen(true)
                  setForgotSent(false)
                  setForgotEmail("")
                }}
              />
            </TabsContent>

            <TabsContent value="hr" className="mt-6">
              <LoginForm 
                role="hr"
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                isLoading={isLoading}
                error={error}
                onSubmit={handleLogin}
                onSignupClick={() => openSignup("hr")}
                onForgotPasswordClick={() => {
                  setForgotOpen(true)
                  setForgotSent(false)
                  setForgotEmail("")
                }}
              />
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {"Don't have an account? "}
            <button 
              onClick={() => openSignup(activeTab)}
              className="text-primary hover:underline font-medium"
            >
              Sign up
            </button>
          </p>
          </div>

          <section
            ref={aboutSectionRef}
            className="space-y-4 rounded-[1.9rem] border border-border/80 bg-card/80 p-5 shadow-[0_18px_36px_rgba(15,23,42,0.08)] backdrop-blur-md xl:hidden sm:p-6"
          >
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Intelligent hiring workflow
            </div>
            <div className="space-y-2.5">
              <h2 className="text-balance text-2xl font-bold leading-[1.04] tracking-[-0.04em] text-foreground">
                Hire faster.
                <br />
                <span className="text-primary">Hire smarter.</span>
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Transform your recruitment with AI-driven resume screening, intelligent candidate ranking, and seamless job management.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FeatureCard
                icon={<Users className="h-5 w-5" />}
                title="For Candidates"
                description="Browse jobs and track applications"
              />
              <FeatureCard
                icon={<Briefcase className="h-5 w-5" />}
                title="For HR Teams"
                description="AI-powered candidate ranking"
              />
            </div>

            <div className="rounded-[1.4rem] border border-border/80 bg-background/72 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:bg-background/42">
              <p className="text-sm font-medium text-foreground">
                Built for modern hiring teams that want speed without losing judgment.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Review candidates, collaborate with hiring teams, and keep applicants informed from one polished workspace.
              </p>
            </div>
          </section>

          {/* Forgot Password Dialog */}
          <Dialog
            open={forgotOpen}
            onOpenChange={(open) => {
              setForgotOpen(open)
              if (!open) {
                setForgotEmail("")
                setForgotSent(false)
                setForgotError("")
                setForgotLoading(false)
              }
            }}
          >
            <DialogContent className="bg-card border-border max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">Reset Password</DialogTitle>
                <DialogDescription>
                  Enter your email and we'll send you a reset link.
                </DialogDescription>
              </DialogHeader>
              {forgotSent ? (
                <div className="py-6 text-center space-y-3">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                  <p className="text-foreground font-medium">Reset link sent!</p>
                  <p className="text-sm text-muted-foreground">Check your email inbox.</p>
                </div>
              ) : (
                <div className="space-y-4 mt-2">
                  <Input
                    type="email"
                    value={forgotEmail}
                    onChange={e => {
                      setForgotEmail(e.target.value)
                      setForgotError("")
                    }}
                    placeholder="your@email.com"
                    className="bg-input border-border text-foreground"
                  />
                  {forgotError && (
                    <p className="text-sm text-destructive">{forgotError}</p>
                  )}
                  <Button
                    onClick={async () => {
                      if (!forgotEmail) return
                      setForgotLoading(true)
                      setForgotError("")
                      try {
                        await authService.forgotPassword(forgotEmail)
                        setForgotSent(true)
                      } catch (err) {
                        const detail = getAuthErrorDetail(err)
                        const message =
                          typeof detail === "string"
                            ? detail
                            : getDetailMessage(detail) || "Unable to send reset email right now. Please try again."
                        setForgotError(
                          message.toLowerCase().includes("rate limit")
                            ? "Too many reset requests. Please wait a bit and try again."
                            : message,
                        )
                      } finally {
                        setForgotLoading(false)
                      }
                    }}
                    disabled={forgotLoading || !forgotEmail}
                    className="w-full bg-primary text-primary-foreground"
                  >
                    {forgotLoading ? (
                      <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* OTP Verification Screen */}
      {otpStep && otpMode === "login" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-md dark:bg-black/60">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.10),transparent_34%),linear-gradient(315deg,rgba(59,130,246,0.09),transparent_36%)]" />
          <Card className="relative w-full max-w-[460px] overflow-hidden border-border/80 bg-card/96 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:bg-card/95 dark:shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
            <div className="h-1 w-full bg-gradient-to-r from-primary via-cyan-500 to-emerald-500" />
            <CardHeader className="items-center justify-items-center px-6 pb-4 pt-8 text-center">
              <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <ShieldCheck className="block h-7 w-7" strokeWidth={1.9} />
              </div>
              <CardTitle className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                Verify your identity
              </CardTitle>
              <CardDescription className="max-w-sm text-sm leading-relaxed">
                Enter the 6-digit verification code sent to your email.
              </CardDescription>
              <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-border/80 bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">{otpEmail}</span>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-6 pb-7">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={(value) => setOtpValue(value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleOtpSubmit()
                  }}
                  containerClassName="justify-center gap-2"
                >
                  <InputOTPGroup className="gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="h-12 w-11 rounded-xl border border-border/90 bg-input text-lg font-bold text-foreground shadow-sm data-[active=true]:border-primary data-[active=true]:ring-primary/20 sm:h-13 sm:w-12"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-xs font-medium text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5 text-primary" />
                {countdown > 0 ? (
                  <span>Code expires in <span className="font-semibold text-foreground">{formattedCountdown}</span></span>
                ) : (
                  <span className="font-semibold text-red-500">Code expired</span>
                )}
              </div>

              {otpError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-500">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              <Button
                onClick={handleOtpSubmit}
                disabled={otpLoading || otpValue.length !== 6}
                className="h-11 w-full"
              >
                {otpLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Verify and sign in
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeOtpStep}
                  className="px-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResendOtp}
                  disabled={countdown > 180}
                  className="px-2 text-primary hover:text-primary"
                >
                  <RotateCcw className="h-4 w-4" />
                  Resend OTP
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legacy OTP Verification Screen */}
      {false && otpStep && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="bg-card border-border w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-primary text-sm font-bold">OTP</span>
                </div>
                Verify Your Identity
              </CardTitle>
              <CardDescription>
                Enter the 6-digit code sent to <strong>{otpEmail}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={otpValue}
                onChange={e => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="bg-input border-border text-foreground text-center text-2xl tracking-widest font-mono"
                onKeyDown={e => e.key === "Enter" && handleOtpSubmit()}
              />

              {otpError && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  {/* You can use an icon here if you import one, e.g. <AlertCircle className="h-3 w-3" /> */}
                  {otpError}
                </p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {countdown > 0
                  ? `Code expires in ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`
                  : "Code expired"}
              </p>

              <Button
                onClick={handleOtpSubmit}
                disabled={otpLoading || otpValue.length !== 6}
                className="w-full bg-primary text-primary-foreground"
              >
                {otpLoading
                  ? <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  : "Verify & Sign In"
                }
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => { setOtpStep(false); setOtpValue(""); setOtpError("") }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ← Back
                </button>
                <button
                  onClick={handleResendOtp}
                  disabled={countdown > 180}
                  className="text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Resend OTP
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Signup Dialog */}
      <Dialog open={isSignupOpen} onOpenChange={handleSignupDialogChange}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              {signupStep === "verify" ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Verify your email
                </>
              ) : (
                <>
                  <UserPlus className="h-5 w-5 text-primary" />
                  Create {signupRole === "hr" ? "HR Manager" : "Candidate"} Account
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {signupStep === "verify"
                ? "Enter the 6-digit code we emailed to finish creating your account."
                : "Fill in your details to create a new account"}
            </DialogDescription>
          </DialogHeader>

          {signupStep === "verify" ? (
            <div className="space-y-5 pt-2">
              <div className="flex justify-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                  <ShieldCheck className="h-7 w-7" strokeWidth={1.9} />
                </div>
              </div>
              <div className="text-center">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/80 bg-secondary/70 px-3 py-1.5 text-xs font-semibold text-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{otpEmail}</span>
                </div>
              </div>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={(value) => setOtpValue(value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleOtpSubmit()
                  }}
                  containerClassName="justify-center gap-2"
                >
                  <InputOTPGroup className="gap-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="h-12 w-11 rounded-xl border border-border/90 bg-input text-lg font-bold text-foreground shadow-sm data-[active=true]:border-primary data-[active=true]:ring-primary/20 sm:h-13 sm:w-12"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-xs font-medium text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5 text-primary" />
                {countdown > 0 ? (
                  <span>Code expires in <span className="font-semibold text-foreground">{formattedCountdown}</span></span>
                ) : (
                  <span className="font-semibold text-red-500">Code expired</span>
                )}
              </div>
              {otpError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-500">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}
              <Button
                onClick={handleOtpSubmit}
                disabled={otpLoading || otpValue.length !== 6}
                className="h-11 w-full"
              >
                {otpLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Verify email
                  </>
                )}
              </Button>
              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeOtpStep}
                  className="px-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResendOtp}
                  disabled={countdown > 180}
                  className="px-2 text-primary hover:text-primary"
                >
                  <RotateCcw className="h-4 w-4" />
                  Resend OTP
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-foreground">First Name</Label>
                  <Input 
                    id="firstName"
                    name="firstName"
                    placeholder="John"
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-foreground">Last Name</Label>
                  <Input 
                    id="lastName"
                    name="lastName"
                    placeholder="Doe"
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signupEmail" className="text-foreground">Email</Label>
                <Input
                  id="signupEmail"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="name@company.com"
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>

              {signupRole === "hr" && (
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-foreground">Company Name</Label>
                  <Input 
                    id="company"
                    name="company"
                    placeholder="Your Company Inc."
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                    required
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="signupPassword" className="text-foreground">Password</Label>
                <div className="relative">
                  <Input
                    id="signupPassword"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a password"
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                    required
                    minLength={8}
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter value={signupPassword} />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={isLoading || !signupPasswordStrength.isStrong}
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Account
                  </>
                )}
              </Button>
              {error && (
                <div className="text-destructive text-sm text-center mt-2">{error}</div>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

