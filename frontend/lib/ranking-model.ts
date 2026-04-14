/**
 * Candidate Ranking Model
 * 
 * This module contains the core ranking algorithm logic.
 * Customize calculateCandidateScore() with your own model/logic
 */

export interface RankingInput {
  name: string
  email: string
  phone: string
  experience: string
  skills: string[]
  resumeText?: string
  jobDescription?: string
  requestedSkills?: string[]
}

export interface RankingOutput {
  aiScore: number          // 0-100
  resumeMatch: number      // 0-100
  skillsMatch: number      // 0-100
  experienceMatch: number  // 0-100
  reasoning?: string       // Optional: why this score
}

export interface JobRequirements {
  requiredSkills: string[]
  minExperience: number
  jobDescription: string
  educationLevel?: string
}

/**
 * Main ranking algorithm
 * Replace this with your custom model
 */
export function calculateCandidateScore(
  input: RankingInput,
  jobRequirements?: JobRequirements
): RankingOutput {
  // Calculate skills match
  const skillsMatch = calculateSkillsMatch(
    input.skills,
    jobRequirements?.requiredSkills || []
  )

  // Calculate experience match
  const experienceMatch = calculateExperienceMatch(
    input.experience,
    jobRequirements?.minExperience || 0
  )

  // Calculate resume match (if resume text is provided)
  const resumeMatch = input.resumeText
    ? calculateResumeMatch(input.resumeText, jobRequirements?.jobDescription)
    : 70

  // Weighted average (you can adjust weights)
  const aiScore = Math.round(
    skillsMatch * 0.4 +      // 40% weight
    experienceMatch * 0.35 + // 35% weight
    resumeMatch * 0.25       // 25% weight
  )

  return {
    aiScore,
    resumeMatch,
    skillsMatch,
    experienceMatch,
    reasoning: `Scored ${aiScore}% based on skills match (${skillsMatch}%), experience (${experienceMatch}%), and resume alignment (${resumeMatch}%)`
  }
}

/**
 * Calculate skills match percentage
 * Compares candidate skills with required skills
 */
function calculateSkillsMatch(
  candidateSkills: string[],
  requiredSkills: string[]
): number {
  if (requiredSkills.length === 0) return 70

  const matchedSkills = candidateSkills.filter(skill =>
    requiredSkills.some(required =>
      skill.toLowerCase().includes(required.toLowerCase()) ||
      required.toLowerCase().includes(skill.toLowerCase())
    )
  )

  return Math.round((matchedSkills.length / requiredSkills.length) * 100)
}

/**
 * Calculate experience match percentage
 * Based on years of experience
 */
function calculateExperienceMatch(
  experience: string,
  minYearsRequired: number = 0
): number {
  // Parse years from string like "5 years" or "5"
  const yearsMatch = experience.match(/\d+/)
  if (!yearsMatch) return 50

  const years = parseInt(yearsMatch[0])
  
  if (years >= minYearsRequired + 5) return 100 // Over-qualified
  if (years >= minYearsRequired) return 85
  if (years >= minYearsRequired - 1) return 70
  
  return Math.max(30, (years / minYearsRequired) * 100)
}

/**
 * Calculate resume match percentage
 * Simple text matching algorithm
 */
function calculateResumeMatch(
  resumeText: string,
  jobDescription?: string
): number {
  if (!jobDescription) return 65

  const resumeWords = resumeText.toLowerCase().split(/\s+/)
  const jobWords = jobDescription.toLowerCase().split(/\s+/)

  const matchedWords = jobWords.filter(word =>
    resumeWords.some(rWord => rWord.includes(word) || word.length > 5)
  )

  return Math.round((matchedWords.length / jobWords.length) * 100)
}

/**
 * Alternative: API-based ranking
 * Uncomment and use if you have a backend service
 */
export async function calculateCandidateScoreViaAPI(
  input: RankingInput,
  jobRequirements?: JobRequirements
): Promise<RankingOutput> {
  try {
    const response = await fetch("/api/rank-candidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidate: input,
        jobRequirements,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to calculate ranking")
    }

    return response.json()
  } catch (error) {
    console.error("Ranking API error:", error)
    // Fallback to local calculation
    return calculateCandidateScore(input, jobRequirements)
  }
}

/**
 * Batch process multiple candidates
 * Useful for ranking large lists
 */
export async function rankMultipleCandidates(
  candidates: RankingInput[],
  jobRequirements?: JobRequirements
): Promise<(RankingInput & RankingOutput)[]> {
  return candidates.map(candidate => ({
    ...candidate,
    ...calculateCandidateScore(candidate, jobRequirements),
  }))
}
