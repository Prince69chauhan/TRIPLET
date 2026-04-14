"""
Triplet - Hard Filter
Checks candidate profile against job criteria.
If any check fails, candidate is filtered out immediately.
"""
from typing import Optional, Tuple

from app.models.models import CandidateProfile, JobDescription


def run_hard_filter(
    profile: CandidateProfile,
    jd: JobDescription,
) -> Tuple[bool, Optional[str]]:
    """
    Runs all hard filter checks.
    Returns (passed, fail_reason).
    """

    if jd.min_tenth_percentage is not None:
        if profile.tenth_percentage is None:
            return False, "10th percentage not provided"
        if float(profile.tenth_percentage) < float(jd.min_tenth_percentage):
            return False, (
                f"10th percentage {profile.tenth_percentage} is below minimum "
                f"required {jd.min_tenth_percentage}"
            )

    if jd.min_twelfth_percentage is not None:
        if profile.twelfth_percentage is None:
            return False, "12th percentage not provided"
        if float(profile.twelfth_percentage) < float(jd.min_twelfth_percentage):
            return False, (
                f"12th percentage {profile.twelfth_percentage} is below minimum "
                f"required {jd.min_twelfth_percentage}"
            )

    if jd.min_cgpa is not None:
        if profile.cgpa is None:
            return False, "CGPA not provided"
        if float(profile.cgpa) < float(jd.min_cgpa):
            return False, (
                f"CGPA {profile.cgpa} is below minimum "
                f"required {jd.min_cgpa}"
            )

    if jd.min_passout_year is not None:
        if profile.passout_year is None:
            return False, "Passout year not provided"
        if profile.passout_year < jd.min_passout_year:
            return False, (
                f"Passout year {profile.passout_year} is before "
                f"minimum required {jd.min_passout_year}"
            )

    if jd.max_passout_year is not None:
        if profile.passout_year is None:
            return False, "Passout year not provided"
        if profile.passout_year > jd.max_passout_year:
            return False, (
                f"Passout year {profile.passout_year} is after "
                f"maximum allowed {jd.max_passout_year}"
            )

    if not jd.allow_gap:
        if profile.has_gap:
            return False, "Gap year is not allowed for this position"
    elif jd.max_gap_months and jd.max_gap_months > 0:
        if profile.gap_duration_months > jd.max_gap_months:
            return False, (
                f"Gap of {profile.gap_duration_months} months exceeds "
                f"maximum allowed {jd.max_gap_months} months"
            )

    if not jd.allow_backlogs:
        if profile.active_backlogs > 0:
            return False, (
                f"Active backlogs ({profile.active_backlogs}) "
                f"are not allowed for this position"
            )
    elif jd.max_active_backlogs is not None:
        if profile.active_backlogs > jd.max_active_backlogs:
            return False, (
                f"Active backlogs ({profile.active_backlogs}) exceed "
                f"maximum allowed ({jd.max_active_backlogs})"
            )

    return True, None
