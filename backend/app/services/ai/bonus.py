"""
Triplet - Bonus Engine
Computes bonus score B based on:
- Skills used in real projects/internships
- Elite company internships
- Project complexity level
- Internship duration
"""
from typing import Any, Dict, List, Tuple

from app.models.models import JobDescription

MAX_TOTAL_BONUS = 30.0
MAX_SKILL_BONUS = 10.0
MAX_ELITE_BONUS = 10.0
MAX_PROJECT_LEVEL_BONUS = 5.0
MAX_INTERNSHIP_DURATION_BONUS = 5.0

LEVEL_MULTIPLIER = {
    "advanced": 3,
    "medium": 2,
    "basic": 1,
}


def compute_bonus(
    jd: JobDescription,
    projects: List[Dict[str, Any]],
    internships: List[Dict[str, Any]],
    jd_skills: List[str],
) -> Tuple[float, Dict[str, float]]:
    """
    Computes total bonus score B and detailed breakdown.

    Returns:
        (bonus_total, bonus_breakdown_dict)
    """
    breakdown = {
        "skill_in_project": 0.0,
        "elite_internship": 0.0,
        "project_level": 0.0,
        "internship_duration": 0.0,
    }

    jd_skills_lower = [s.lower() for s in jd_skills]
    skills_matched = set()

    for project in projects:
        project_skills = [s.lower() for s in project.get("skills_used", [])]
        for skill in jd_skills_lower:
            if skill in project_skills and skill not in skills_matched:
                skills_matched.add(skill)
                breakdown["skill_in_project"] += jd.bonus_skill_in_project

    for internship in internships:
        intern_skills = [s.lower() for s in internship.get("skills_used", [])]
        for skill in jd_skills_lower:
            if skill in intern_skills and skill not in skills_matched:
                skills_matched.add(skill)
                breakdown["skill_in_project"] += jd.bonus_skill_in_project

    for internship in internships:
        if internship.get("is_elite"):
            breakdown["elite_internship"] += jd.bonus_elite_internship

    for project in projects:
        level = project.get("level", "basic")
        multiplier = LEVEL_MULTIPLIER.get(level, 1)
        breakdown["project_level"] += jd.bonus_project_level * multiplier

    for internship in internships:
        duration = internship.get("duration_months", 0)
        breakdown["internship_duration"] += (
            duration * jd.bonus_internship_duration
        )

    breakdown["skill_in_project"] = min(
        breakdown["skill_in_project"],
        MAX_SKILL_BONUS,
    )
    breakdown["elite_internship"] = min(
        breakdown["elite_internship"],
        MAX_ELITE_BONUS,
    )
    breakdown["project_level"] = min(
        breakdown["project_level"],
        MAX_PROJECT_LEVEL_BONUS,
    )
    breakdown["internship_duration"] = min(
        breakdown["internship_duration"],
        MAX_INTERNSHIP_DURATION_BONUS,
    )

    bonus_total = min(sum(breakdown.values()), MAX_TOTAL_BONUS)

    breakdown = {key: round(value, 2) for key, value in breakdown.items()}
    bonus_total = round(bonus_total, 2)

    return bonus_total, breakdown


def normalize_final_score(base_score_m: float, bonus_score_b: float) -> float:
    """
    Computes D = M + B, clamped to 0-100.
    Bonus is intentionally capped so semantic similarity remains
    the dominant signal and bonus features act as tie-breakers.
    """
    raw = base_score_m + bonus_score_b
    return round(max(0.0, min(100.0, raw)), 2)
