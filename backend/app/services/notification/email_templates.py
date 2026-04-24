"""
Triplet — Email Templates
All email content in one place — easy to update.
"""


def welcome_candidate(full_name: str, email: str) -> tuple[str, str]:
    subject = "Welcome to Triplet — Your AI-Powered Career Platform 🎉"
    body = f"""Hi {full_name},

Welcome to Triplet! We're thrilled to have you on board.

Your account has been successfully created.
Email : {email}
Role  : Candidate

Here's what you can do on Triplet:
- Upload your resume and let our AI extract your skills
- Browse job listings from top companies
- Apply with one click — no extra forms
- Track your application status and AI match score in real time

Get started by completing your profile:
http://localhost:3000/setup

If you have any questions, feel free to reach out.

— The Triplet Team
"""
    return subject, body


def welcome_employer(company_name: str, email: str) -> tuple[str, str]:
    subject = "Welcome to Triplet — Start Hiring Smarter 🚀"
    body = f"""Hi {company_name},

Welcome to Triplet! Your employer account is ready.

Email   : {email}
Role    : Employer / HR Manager

Here's what you can do:
- Post job descriptions with detailed requirements
- Our AI automatically ranks candidates by match score
- Set hard filters — CGPA, gap, backlogs, skills
- Get instant tamper alerts if a resume is modified

Log in to start posting jobs:
http://localhost:3000

— The Triplet Team
"""
    return subject, body


def otp_login(full_name: str, otp: str) -> tuple[str, str]:
    subject = "Your Triplet Login OTP"
    body = f"""Hi {full_name},

Your one-time login code for Triplet is:

        {otp}

This code expires in 4 minutes.
Do not share this code with anyone.

If you did not request this, please ignore this email.
Your account remains secure.

— The Triplet Team
"""
    return subject, body


def forgot_password(full_name: str, reset_token: str) -> tuple[str, str]:
    reset_url = f"http://localhost:3000/reset-password?token={reset_token}"
    subject = "Reset Your Triplet Password"
    body = f"""Hi {full_name},

We received a request to reset your Triplet password.

Click the link below to set a new password:
{reset_url}

This link expires in 15 minutes and can only be used once.
If you did not request a password reset, you can safely ignore this email
— your account remains secure.

— The Triplet Team
"""
    return subject, body


def password_change_verification(full_name: str, otp: str) -> tuple[str, str]:
    subject = "Verify your Triplet password change"
    body = f"""Hi {full_name},

We received a request to update your Triplet account password from the settings page.

Enter the verification code below to confirm this change:

        {otp}

This code expires in 4 minutes.
If you did not request this password update, please ignore this email and keep your current password.

— The Triplet Team
"""
    return subject, body


def email_verification(full_name: str, otp: str) -> tuple[str, str]:
    subject = "Verify your email for Triplet"
    body = f"""Hi {full_name},

Thanks for creating a Triplet account. To finish signing up, enter the
verification code below on the sign-up screen:

        {otp}

This code expires in 4 minutes.
Do not share this code with anyone.

If you did not create an account, please ignore this email.

— The Triplet Team
"""
    return subject, body


def password_reset_success(full_name: str) -> tuple[str, str]:
    subject = "Your Triplet Password Has Been Reset"
    body = f"""Hi {full_name},

Your Triplet password has been successfully reset.

If you did not make this change, please contact us immediately
by replying to this email.

— The Triplet Team
"""
    return subject, body
