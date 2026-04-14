/**
 * API Route for Candidate Ranking
 * 
 * Path: app/api/rank-candidate/route.ts
 * 
 * This endpoint can be used to:
 * 1. Call your Python ML model service
 * 2. Call an external ranking API
 * 3. Perform backend calculations
 * 
 * Usage from frontend:
 * POST /api/rank-candidate
 * {
 *   candidate: { name, email, phone, experience, skills, resumeText },
 *   jobRequirements: { requiredSkills, minExperience, jobDescription }
 * }
 */

import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { candidate, jobRequirements } = body

    // Validate input
    if (!candidate || !candidate.name) {
      return NextResponse.json(
        { error: "Invalid candidate data" },
        { status: 400 }
      )
    }

    // ============================================
    // OPTION 1: Local Python Service
    // ============================================
    // Uncomment this if you have a Python backend
    /*
    const pythonServiceUrl = process.env.PYTHON_RANKING_SERVICE_URL || "http://localhost:5000"
    
    const response = await fetch(`${pythonServiceUrl}/api/rank-candidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate, jobRequirements }),
    })

    if (!response.ok) {
      throw new Error(`Python service error: ${response.statusText}`)
    }

    const rankingResult = await response.json()
    return NextResponse.json(rankingResult)
    */

    // ============================================
    // OPTION 2: External API (e.g., HuggingFace)
    // ============================================
    // Uncomment this if you're using an external API
    /*
    const externalApiUrl = "https://api-inference.huggingface.co/models/your-model"
    const apiKey = process.env.HUGGINGFACE_API_KEY

    const response = await fetch(externalApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: JSON.stringify(candidate),
        parameters: { jobRequirements },
      }),
    })

    const result = await response.json()
    return NextResponse.json(result)
    */

    // ============================================
    // OPTION 3: Backend Calculation (Node.js)
    // ============================================
    // Perform calculation in Node.js backend
    
    const rankingResult = performBackendRanking(candidate, jobRequirements)
    return NextResponse.json(rankingResult)
  } catch (error) {
    console.error("Ranking API error:", error)
    return NextResponse.json(
      {
        error: "Failed to calculate ranking",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * Backend ranking calculation
 * Implement your algorithm here
 */
function performBackendRanking(candidate: any, jobRequirements: any) {
  const { skills = [], experience = "0" } = candidate
  const { requiredSkills = [], minExperience = 0 } = jobRequirements || {}

  // Example: Simple skill matching
  const matchedSkills = skills.filter((skill: string) =>
    requiredSkills.some((req: string) =>
      skill.toLowerCase().includes(req.toLowerCase())
    )
  )

  const skillsMatch = requiredSkills.length > 0
    ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
    : 70

  // Parse experience
  const yearsMatch = String(experience).match(/\d+/)
  const years = yearsMatch ? parseInt(yearsMatch[0]) : 0

  const experienceMatch =
    years >= minExperience ? Math.min(100, 70 + years * 5) : years * 20

  // Weighted score
  const aiScore = Math.round(
    skillsMatch * 0.4 + experienceMatch * 0.6
  )

  return {
    aiScore: Math.min(100, aiScore),
    resumeMatch: 75,
    skillsMatch,
    experienceMatch: Math.min(100, experienceMatch),
    reasoning: `Matched ${matchedSkills.length}/${requiredSkills.length} required skills`,
  }
}

/**
 * Alternative: Call Python backend
 * 
 * Environment variables needed in .env.local:
 * PYTHON_RANKING_SERVICE_URL=http://localhost:5000
 * 
 * Python backend example (Flask):
 * 
 * @app.route('/api/rank-candidate', methods=['POST'])
 * def rank_candidate():
 *     data = request.json
 *     candidate = data['candidate']
 *     job_reqs = data['jobRequirements']
 *     
 *     # Your ML model here
 *     score = your_model.predict(candidate)
 *     
 *     return {
 *         'aiScore': int(score * 100),
 *         'resumeMatch': 80,
 *         'skillsMatch': 85,
 *         'experienceMatch': 75
 *     }
 */
