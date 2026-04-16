"use client"

import { useState, useEffect } from "react"
import { authService } from "@/lib/authService"
import { candidateService } from "@/lib/candidateService"
import { removeSessionValue } from "@/lib/browser-session"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Briefcase, Users, Sparkles, ArrowRight, Eye, EyeOff, UserPlus, CheckCircle2 } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"candidate" | "hr">("candidate")
  const [isSignupOpen, setIsSignupOpen] = useState(false)
  const [signupRole, setSignupRole] = useState<"candidate" | "hr">("candidate")
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [error, setError] = useState("")

  // OTP login state
  const [otpStep, setOtpStep] = useState(false)
  const [otpEmail, setOtpEmail] = useState("")
  const [otpValue, setOtpValue] = useState("")
  const [otpError, setOtpError] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loginError, setLoginError] = useState("")

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  // OTP login flow
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError("")

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const response = await authService.login({ email, password })
      setOtpEmail(email)
      setOtpStep(true)
      setCountdown(response.expires_in)
    } catch (err: any) {
      setLoginError(err?.response?.data?.detail || "Login failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpSubmit = async () => {
    if (otpValue.length !== 6) {
      setOtpError("Please enter the 6-digit OTP.")
      return
    }
    setOtpLoading(true)
    setOtpError("")
    try {
      const data = await authService.verifyOtp(otpEmail, otpValue)
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
      setOtpError(err?.response?.data?.detail || "Invalid OTP. Please try again.")
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResendOtp = async () => {
    try {
      const response = await authService.resendOtp(otpEmail)
      setCountdown(response.expires_in)
      setOtpError("")
    } catch (err: any) {
      setOtpError(err?.response?.data?.detail || "Could not resend OTP.")
    }
  }

  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    const formData = new FormData(e.currentTarget)
    const password = formData.get("password") as string
    const confirm = formData.get("confirmPassword") as string

    if (password !== confirm) {
      setError("Passwords do not match.")
      setIsLoading(false)
      return
    }

    try {
      if (signupRole === "candidate") {
        await authService.registerCandidate({
          email: formData.get("email") as string,
          password,
          full_name: `${formData.get("firstName") || ""} ${formData.get("lastName") || ""}`,
        })
      } else {
        await authService.registerEmployer({
          email: formData.get("email") as string,
          password,
          company_name: formData.get("company") as string || "My Company",
        })
      }
      setSignupSuccess(true)
      setTimeout(() => { setIsSignupOpen(false); setSignupSuccess(false) }, 2000)
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Registration failed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const openSignup = (role: "candidate" | "hr") => {
    setSignupRole(role)
    setIsSignupOpen(true)
    setSignupSuccess(false)
  }

  return (
    <div className="min-h-screen bg-background xl:grid xl:grid-cols-[1.08fr_0.92fr]">
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
              Smart Hiring
              <br />
              <span className="text-primary">Powered by AI</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Transform your recruitment process with AI-driven resume screening, 
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
      <div className="relative flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-lg space-y-7">
          {/* Mobile Logo */}
          <div className="flex items-center justify-center gap-3 xl:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="block text-2xl font-bold tracking-[0.16em] text-foreground">TRIPLET</span>
              <span className="block text-[11px] uppercase tracking-[0.22em] text-muted-foreground">AI Hiring Platform</span>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border/80 bg-card/84 p-6 shadow-[0_20px_44px_rgba(15,23,42,0.1)] backdrop-blur-md dark:bg-card/94 sm:p-8">
          <div className="text-center xl:text-left">
            <div className="inline-flex items-center rounded-full border border-border/80 bg-secondary/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Secure workspace access
            </div>
            <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-foreground">Welcome back</h2>
            <p className="mt-2 text-muted-foreground">Sign in to continue to your dashboard</p>
            {loginError && (
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

          {/* Forgot Password Dialog */}
          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
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
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="bg-input border-border text-foreground"
                  />
                  <Button
                    onClick={async () => {
                      if (!forgotEmail) return
                      try {
                        await authService.forgotPassword(forgotEmail)
                        setForgotSent(true)
                      } catch {
                        setForgotSent(true)
                      }
                    }}
                    className="w-full bg-primary text-primary-foreground"
                  >
                    Send Reset Link
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* OTP Verification Screen */}
      {otpStep && (
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
                  disabled={countdown > 540}
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
      <Dialog open={isSignupOpen} onOpenChange={setIsSignupOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Create {signupRole === "hr" ? "HR Manager" : "Candidate"} Account
            </DialogTitle>
            <DialogDescription>
              Fill in your details to create a new account
            </DialogDescription>
          </DialogHeader>
          
          {signupSuccess ? (
            <div className="py-8 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Account Created!</h3>
              <p className="text-muted-foreground mt-2">You can now sign in with your credentials</p>
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
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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

              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading}>
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

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="border-border/80 bg-card/68 backdrop-blur-sm dark:bg-background/20">
      <CardContent className="p-5">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function LoginForm({ 
  role, 
  showPassword, 
  setShowPassword, 
  isLoading, 
  error,
  onSubmit,
  onSignupClick,
  onForgotPasswordClick
}: { 
  role: string
  showPassword: boolean
  setShowPassword: (show: boolean) => void
  isLoading: boolean
  error: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onSignupClick: () => void
  onForgotPasswordClick: () => void
}) {
  return (
    <Card className="border-border/80 bg-card/82 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-card/94">
      <CardHeader>
        <CardTitle className="text-foreground tracking-[-0.02em]">Sign in as {role === "hr" ? "HR Manager" : "Candidate"}</CardTitle>
        <CardDescription>
          Enter your credentials to access your {role === "hr" ? "recruitment" : "job"} dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${role}-email`} className="text-foreground">Email</Label>
            <Input
              id={`${role}-email`}
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${role}-password`} className="text-foreground">Password</Label>
            <div className="relative">
              <Input
                id={`${role}-password`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                className="bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="rounded border-border bg-input accent-primary" />
              Remember me
            </label>
            <button
              type="button"
              onClick={onForgotPasswordClick}
              className="text-sm text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading}>
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          {error && (
            <div className="text-destructive text-sm text-center mt-2">{error}</div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
