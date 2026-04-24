// Keep the rules in sync with the backend validator
// (backend/app/schemas/auth.py :: validate_password_strength).

export type PasswordRuleId = "length" | "lower" | "upper" | "digit" | "special"

export type PasswordRule = {
  id: PasswordRuleId
  label: string
  test: (value: string) => boolean
}

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length",  label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: v => v.length >= PASSWORD_MIN_LENGTH },
  { id: "lower",   label: "One lowercase letter",                      test: v => /[a-z]/.test(v) },
  { id: "upper",   label: "One uppercase letter",                      test: v => /[A-Z]/.test(v) },
  { id: "digit",   label: "One digit",                                 test: v => /\d/.test(v) },
  { id: "special", label: "One special character",                     test: v => /[^A-Za-z0-9]/.test(v) },
]

export type PasswordStrength = {
  score: number              // 0..PASSWORD_RULES.length
  satisfied: Set<PasswordRuleId>
  isStrong: boolean
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong"
}

export function evaluatePassword(value: string): PasswordStrength {
  const satisfied = new Set<PasswordRuleId>(
    PASSWORD_RULES.filter(r => r.test(value)).map(r => r.id),
  )
  const score = satisfied.size
  const isStrong = score === PASSWORD_RULES.length

  let label: PasswordStrength["label"] = "Too short"
  if (value.length === 0) label = "Too short"
  else if (score <= 2) label = "Weak"
  else if (score === 3) label = "Fair"
  else if (score === 4) label = "Good"
  else label = "Strong"

  return { score, satisfied, isStrong, label }
}
