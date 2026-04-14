# Candidate Ranking Model Integration Guide

This guide explains how to integrate your own custom candidate ranking model into the application.

## 📋 Current Architecture

Current implementation uses static `aiScore` values (0-100) defined in mock data. Your task is to replace this with a custom ranking algorithm.

## 🎯 Integration Steps

### Step 1: Create a Ranking Model Service

Create a new file: `lib/ranking-model.ts`

```typescript
// lib/ranking-model.ts
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

/**
 * Your custom ranking algorithm
 */
export function calculateCandidateScore(
  input: RankingInput,
  jobRequirements?: {
    requiredSkills: string[]
    minExperience: number
    jobDescription: string
  }
): RankingOutput {
  // IMPLEMENT YOUR CUSTOM LOGIC HERE
  
  // Example: Simple scoring system
  let resumeMatch = 70
  let skillsMatch = 75
  let experienceMatch = 68
  
  // Calculate weighted average
  const aiScore = Math.round(
    (resumeMatch * 0.3 + skillsMatch * 0.4 + experienceMatch * 0.3)
  )
  
  return {
    aiScore,
    resumeMatch,
    skillsMatch,
    experienceMatch,
  }
}
```

### Step 2: Add Dependencies (if needed)

If you're using ML models or APIs, add them to `package.json`:

```bash
# For ML.js library (local ML models)
pnpm add ml

# For TensorFlow.js models
pnpm add @tensorflow/tfjs

# For calling external API
# (no install needed for native fetch)
```

### Step 3: Create a Ranking Calculator Hook

Create: `hooks/use-ranking-calculator.ts`

```typescript
// hooks/use-ranking-calculator.ts
import { Candidate } from "@/components/hr/candidate-ranking-section"
import { calculateCandidateScore, RankingInput } from "@/lib/ranking-model"

interface JobRequirements {
  requiredSkills: string[]
  minExperience: number
  jobDescription: string
}

export function useRankingCalculator() {
  const rankCandidates = (
    candidates: Candidate[],
    jobRequirements: JobRequirements
  ) => {
    return candidates.map(candidate => ({
      ...candidate,
      ...calculateCandidateScore(
        {
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          experience: candidate.experience,
          skills: candidate.skills,
        },
        jobRequirements
      ),
    }))
  }

  return { rankCandidates }
}
```

### Step 4: Update CandidateRankingSection Component

Modify `components/hr/candidate-ranking-section.tsx`:

```typescript
// Add this import
import { useRankingCalculator } from "@/hooks/use-ranking-calculator"

export function CandidateRankingSection() {
  // ... existing state ...
  const { rankCandidates } = useRankingCalculator()
  const [isCalculating, setIsCalculating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Update the sorting logic
  const handleViewRanking = async () => {
    if (!selectedJob) return
    
    setIsCalculating(true)
    setApiError(null)
    
    try {
      // Get candidates for selected job
      const jobCandidates = allCandidates.filter(
        candidate => candidate.jobId === selectedJob
      )
      
      // Get job requirements (you can fetch from your backend)
      const jobRequirements = {
        requiredSkills: ["React", "TypeScript"], // Get from job details
        minExperience: 3,
        jobDescription: selectedJobData?.title || "",
      }
      
      // Calculate scores using your model
      const rankedCandidates = rankCandidates(
        jobCandidates,
        jobRequirements
      )
      
      // Update candidates with new scores
      // (You'll need to store these in state)
      
      setShowRanking(true)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Ranking failed")
    } finally {
      setIsCalculating(false)
    }
  }
```

## 🔌 Options for Model Implementation

### Option 1: Local JavaScript Logic (Simplest)
```typescript
export function calculateCandidateScore(input: RankingInput): RankingOutput {
  // Pure JS algorithm
  let score = 0
  
  // Score based on keywords
  const requiredKeywords = ["react", "typescript", "node"]
  const matchedKeywords = input.skills.filter(skill =>
    requiredKeywords.some(kw => skill.toLowerCase().includes(kw))
  )
  
  const skillsMatch = (matchedKeywords.length / requiredKeywords.length) * 100
  
  return {
    aiScore: Math.round(skillsMatch),
    skillsMatch,
    resumeMatch: 80,
    experienceMatch: 75,
  }
}
```

### Option 2: TensorFlow.js ML Model
```typescript
import * as tf from '@tensorflow/tfjs'

let model: tf.LayersModel

// Load pre-trained model
export async function loadModel() {
  model = await tf.loadLayersModel('indexeddb://ranking-model')
}

export async function calculateCandidateScore(input: RankingInput) {
  // Prepare input features
  const features = tf.tensor2d([
    [
      input.skills.length,
      parseInt(input.experience),
      // ... other features
    ]
  ])
  
  // Get prediction
  const predictions = model.predict(features) as tf.Tensor
  const [score] = await predictions.data()
  
  return {
    aiScore: Math.round(score * 100),
    // ... other metrics
  }
}
```

### Option 3: Backend API Call
```typescript
export async function calculateCandidateScore(input: RankingInput) {
  const response = await fetch('/api/rank-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  
  if (!response.ok) throw new Error('Ranking API error')
  
  return response.json() // Returns RankingOutput
}
```

Create the API route: `app/api/rank-candidate/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { RankingInput, RankingOutput } from '@/lib/ranking-model'

export async function POST(request: NextRequest) {
  try {
    const input: RankingInput = await request.json()
    
    // Call your Python service, ML model, or ranking algorithm
    const result = await yourRankingAlgorithm(input)
    
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate ranking' },
      { status: 500 }
    )
  }
}
```

## 📊 Advanced: Multi-Factor Ranking

```typescript
interface RankingWeights {
  skillsWeight: number      // 0-1
  experienceWeight: number  // 0-1
  educationWeight: number   // 0-1
  resumeWeight: number      // 0-1
}

export function calculateCandidateScore(
  input: RankingInput,
  weights: RankingWeights = {
    skillsWeight: 0.4,
    experienceWeight: 0.35,
    educationWeight: 0.15,
    resumeWeight: 0.1,
  }
): RankingOutput {
  const skillsMatch = calculateSkillsMatch(input.skills, input.jobDescription)
  const experienceMatch = calculateExperienceMatch(input.experience)
  const educationMatch = calculateEducationMatch(input.resumeText)
  const resumeMatch = calculateResumeMatch(input.resumeText)
  
  const aiScore = Math.round(
    (skillsMatch * weights.skillsWeight +
    experienceMatch * weights.experienceWeight +
    educationMatch * weights.educationWeight +
    resumeMatch * weights.resumeWeight) * 100
  )
  
  return {
    aiScore,
    skillsMatch,
    experienceMatch,
    resumeMatch,
    reasoning: `Score based on skills (${skillsMatch}%), experience (${experienceMatch}%), education (${educationMatch}%)`
  }
}
```

## 🧪 Testing Your Model

Create: `__tests__/ranking-model.test.ts`

```typescript
import { calculateCandidateScore } from '@/lib/ranking-model'

describe('Ranking Model', () => {
  it('should score high for exact skill match', () => {
    const result = calculateCandidateScore({
      name: 'Test',
      email: 'test@example.com',
      phone: '123',
      experience: '5 years',
      skills: ['React', 'TypeScript', 'Node.js'],
    })
    
    expect(result.aiScore).toBeGreaterThan(70)
  })
  
  it('should handle edge cases', () => {
    const result = calculateCandidateScore({
      name: '',
      email: '',
      phone: '',
      experience: '0 years',
      skills: [],
    })
    
    expect(result.aiScore).toBeDefined()
    expect(result.aiScore).toBeGreaterThanOrEqual(0)
  })
})
```

## 🚀 Performance Optimization

### Batch Processing
```typescript
export async function rankMultipleCandidates(
  candidates: Candidate[],
  jobRequirements: JobRequirements
) {
  // Process in chunks to avoid overwhelming the system
  const batchSize = 10
  const results = []
  
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(c => calculateCandidateScore(formatInput(c), jobRequirements))
    )
    results.push(...batchResults)
  }
  
  return results
}
```

### Caching
```typescript
const scoreCache = new Map<string, RankingOutput>()

function getCachedScore(candidateId: string, jobId: string): RankingOutput | null {
  return scoreCache.get(`${candidateId}-${jobId}`) || null
}

function cacheScore(candidateId: string, jobId: string, score: RankingOutput) {
  scoreCache.set(`${candidateId}-${jobId}`, score)
}
```

## 📝 Common Model Types

### Keyword-Based
- Simple substring matching
- Best for: Quick, rule-based systems

### Vector Similarity
- Convert text to embeddings
- Compare using cosine similarity
- Best for: Resume matching

### ML Models
- Trained on historical data
- Best for: Accuracy-critical systems

### Hybrid
- Combine multiple methods
- WeightedAggregation
- Best for: Production systems

## 🔄 Integration Checklist

- [ ] Create `lib/ranking-model.ts` with your algorithm
- [ ] Create `hooks/use-ranking-calculator.ts` 
- [ ] Update `components/hr/candidate-ranking-section.tsx`
- [ ] Test with sample data
- [ ] Handle errors gracefully
- [ ] Add loading states
- [ ] Optimize performance for large datasets
- [ ] Document your scoring methodology
- [ ] Add caching if needed
- [ ] Deploy and monitor

## ❓ What Model Should You Use?

Consider:
1. **Data availability**: Do you have historical hiring data?
2. **Complexity**: How nuanced should scoring be?
3. **Latency**: Can you wait for API calls?
4. **Cost**: Are you using external APIs?
5. **Maintenance**: How often will it change?

Start simple (keyword matching) → Add complexity as needed.

