"""
Triplet — NLP Extractor
Extracts skills, projects, internships from raw resume text
using spaCy + keyword matching
"""
import re
from typing import List, Dict, Any

import spacy

# Load spaCy model (loaded once at module level)
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")


# ── Known skills vocabulary ───────────────────────────────────
KNOWN_SKILLS = {
    # Languages
    "python", "java", "javascript", "typescript", "c", "c++", "c#",
    "go", "rust", "kotlin", "swift", "r", "matlab", "scala", "ruby",
    "php", "dart", "bash", "shell",
    # Web
    "react", "angular", "vue", "nextjs", "nodejs", "express", "fastapi",
    "django", "flask", "spring", "laravel", "html", "css", "tailwind",
    "bootstrap", "graphql", "rest", "restapi",
    # Data / AI
    "machine learning", "deep learning", "nlp", "computer vision",
    "tensorflow", "pytorch", "keras", "scikit-learn", "pandas", "numpy",
    "matplotlib", "seaborn", "opencv", "huggingface", "bert", "gpt",
    "langchain", "sbert", "spacy",
    # Databases
    "postgresql", "mysql", "mongodb", "redis", "sqlite", "oracle",
    "cassandra", "elasticsearch", "firebase", "supabase",
    # Cloud / DevOps
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform",
    "jenkins", "github actions", "ci/cd", "linux", "nginx",
    # Tools
    "git", "github", "gitlab", "jira", "figma", "postman",
    "celery", "rabbitmq", "kafka", "airflow",
}

# Project level keywords
PROJECT_LEVEL_KEYWORDS = {
    "advanced" : [
        "distributed", "scalable", "microservices", "real-time",
        "production", "deployed", "published", "enterprise",
        "architecture", "system design", "million", "thousand users",
    ],
    "medium"   : [
        "api", "database", "authentication", "dashboard", "full stack",
        "fullstack", "backend", "frontend", "rest", "crud",
        "integration", "payment", "notification",
    ],
    "basic"    : [
        "simple", "basic", "beginner", "tutorial", "clone",
        "todo", "calculator", "portfolio", "static",
    ],
}


def extract_skills(text: str) -> List[str]:
    """
    Extracts skills from resume text by matching against
    known skills vocabulary. Case-insensitive.
    """
    text_lower = text.lower()
    found = set()

    for skill in KNOWN_SKILLS:
        # Match whole word/phrase
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            found.add(skill)

    return sorted(list(found))


def _classify_project_level(description: str) -> str:
    """
    Classifies a project as basic / medium / advanced
    based on keywords in description.
    """
    desc_lower = description.lower()
    for level in ["advanced", "medium", "basic"]:
        for keyword in PROJECT_LEVEL_KEYWORDS[level]:
            if keyword in desc_lower:
                return level
    return "medium"  # default


def _extract_skills_from_text(text: str, required_skills: List[str] = None) -> List[str]:
    """
    Extracts skills from a project/internship description.
    Optionally cross-references with required skills from JD.
    """
    text_lower = text.lower()
    found = []
    skills_to_check = required_skills if required_skills else list(KNOWN_SKILLS)
    for skill in skills_to_check:
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if re.search(pattern, text_lower):
            found.append(skill)
    return found


def extract_projects(text: str) -> List[Dict[str, Any]]:
    """
    Extracts projects from resume text.
    Looks for sections like 'Projects', 'Personal Projects', etc.
    """
    projects = []

    # Find project section
    project_section = _extract_section(
        text,
        start_keywords=["projects", "personal projects", "academic projects",
                        "project work", "key projects"],
        end_keywords=["experience", "internship", "education", "skills",
                      "certification", "awards", "achievements"],
    )

    if not project_section:
        return projects

    # Split into individual projects by looking for title-like lines
    lines = project_section.split("\n")
    current_project = None
    current_desc = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Heuristic: short lines (< 80 chars) with no sentence ending = project title
        is_title = (
            len(line) < 80
            and not line.endswith(".")
            and not line.startswith("-")
            and not line.startswith("•")
            and len(line.split()) >= 2
        )

        if is_title and current_project is None:
            current_project = line
        elif is_title and current_project is not None:
            # Save previous project
            desc = " ".join(current_desc)
            projects.append({
                "title"       : current_project,
                "description" : desc,
                "skills_used" : _extract_skills_from_text(
                    current_project + " " + desc
                ),
                "level"       : _classify_project_level(
                    current_project + " " + desc
                ),
            })
            current_project = line
            current_desc = []
        else:
            current_desc.append(line)

    # Save last project
    if current_project:
        desc = " ".join(current_desc)
        projects.append({
            "title"       : current_project,
            "description" : desc,
            "skills_used" : _extract_skills_from_text(
                current_project + " " + desc
            ),
            "level"       : _classify_project_level(
                current_project + " " + desc
            ),
        })

    return projects[:10]  # cap at 10 projects


def extract_internships(
    text: str,
    elite_companies: List[str],
) -> List[Dict[str, Any]]:
    """
    Extracts internships from resume text.
    Checks company name against elite_companies list.
    """
    internships = []

    internship_section = _extract_section(
        text,
        start_keywords=["internship", "internships", "work experience",
                        "experience", "training"],
        end_keywords=["projects", "education", "skills", "certification",
                      "achievements", "awards"],
    )

    if not internship_section:
        return internships

    lines = internship_section.split("\n")
    elite_lower = [c.lower() for c in elite_companies]

    current_company = None
    current_desc = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        is_company_line = (
            len(line) < 80
            and not line.startswith("-")
            and not line.startswith("•")
        )

        if is_company_line and current_company is None:
            current_company = line
        elif is_company_line and current_company is not None:
            desc = " ".join(current_desc)
            duration = _extract_duration_months(current_company + " " + desc)
            company_name = _clean_company_name(current_company)
            internships.append({
                "company"        : company_name,
                "duration_months": duration,
                "skills_used"    : _extract_skills_from_text(desc),
                "is_elite"       : company_name.lower() in elite_lower,
            })
            current_company = line
            current_desc = []
        else:
            current_desc.append(line)

    if current_company:
        desc = " ".join(current_desc)
        duration = _extract_duration_months(current_company + " " + desc)
        company_name = _clean_company_name(current_company)
        internships.append({
            "company"        : company_name,
            "duration_months": duration,
            "skills_used"    : _extract_skills_from_text(desc),
            "is_elite"       : company_name.lower() in elite_lower,
        })

    return internships[:5]  # cap at 5 internships


def _extract_duration_months(text: str) -> int:
    """
    Tries to extract internship duration in months from text.
    Handles patterns like '3 months', '6-month', '1 year' etc.
    """
    text_lower = text.lower()

    # Match "X months" or "X month"
    month_match = re.search(r'(\d+)\s*month', text_lower)
    if month_match:
        return int(month_match.group(1))

    # Match "X years" → convert to months
    year_match = re.search(r'(\d+)\s*year', text_lower)
    if year_match:
        return int(year_match.group(1)) * 12

    # Match date ranges like "Jan 2023 - Apr 2023"
    date_range = re.search(
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})'
        r'\s*[-–to]+\s*'
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})',
        text_lower
    )
    if date_range:
        months = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
                  "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
        start_m = months.get(date_range.group(1)[:3], 1)
        start_y = int(date_range.group(2))
        end_m   = months.get(date_range.group(3)[:3], 1)
        end_y   = int(date_range.group(4))
        diff = (end_y - start_y) * 12 + (end_m - start_m)
        return max(1, diff)

    return 2  # default assumption


def _clean_company_name(line: str) -> str:
    """
    Cleans up a company name line by removing dates,
    roles, and other noise.
    """
    # Remove date patterns
    line = re.sub(
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4}',
        '', line, flags=re.IGNORECASE
    )
    line = re.sub(r'\d{4}', '', line)
    line = re.sub(r'[-–|,].*', '', line)
    return line.strip()


def _extract_section(
    text: str,
    start_keywords: List[str],
    end_keywords: List[str],
) -> str:
    """
    Extracts a section from resume text between
    start_keywords and end_keywords (case-insensitive).
    """
    lines = text.split("\n")
    section_lines = []
    in_section = False

    for line in lines:
        line_lower = line.lower().strip()

        if not in_section:
            for kw in start_keywords:
                if kw in line_lower and len(line_lower) < 40:
                    in_section = True
                    break
        else:
            for kw in end_keywords:
                if kw in line_lower and len(line_lower) < 40:
                    return "\n".join(section_lines)
            section_lines.append(line)

    return "\n".join(section_lines)


def extract_all(
    raw_text: str,
    elite_companies: List[str],
) -> Dict[str, Any]:
    """
    Main entry point — runs all extractors on raw text.
    Returns dict with skills, projects, internships.
    """
    return {
        "extracted_skills": extract_skills(raw_text),
        "projects"        : extract_projects(raw_text),
        "internships"     : extract_internships(raw_text, elite_companies),
    }