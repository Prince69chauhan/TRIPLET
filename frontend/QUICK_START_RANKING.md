# Quick Start: Integrate Your Ranking Model

## 📍 Files Created for You

1. **[lib/ranking-model.ts](../lib/ranking-model.ts)** - Core ranking logic (customize this)
2. **[hooks/use-ranking-calculator.ts](../hooks/use-ranking-calculator.ts)** - React hook for using the model  
3. **[app/api/rank-candidate/route.ts](../app/api/rank-candidate/route.ts)** - Backend API endpoint
4. **[ranking_service_example.py](../ranking_service_example.py)** - Python backend example
5. **[RANKING_MODEL_INTEGRATION.md](../RANKING_MODEL_INTEGRATION.md)** - Complete integration guide

---

## 🚀 Step 1: Quick Setup (5 mins)

### Use the Local Model (No Backend Needed)

Edit `lib/ranking-model.ts` and customize the scoring logic:

```typescript
export function calculateCandidateScore(
  input: RankingInput,
  jobRequirements?: JobRequirements
): RankingOutput {
  // Your algorithm here
  const aiScore = 85 // Replace with your logic
  
  return {
    aiScore,
    resumeMatch: 82,
    skillsMatch: 88,
    experienceMatch: 80,
  }
}
```

That's it! Your model is now integrated. ✅

---

## 💡 Implementation Examples

### Example 1: Keyword-Based Scoring (Simplest)

```typescript
function calculateCandidateScore(
  input: RankingInput,
  jobRequirements?: JobRequirements
): RankingOutput {
  const requiredSkills = jobRequirements?.requiredSkills || ["React", "TypeScript"]
  
  // Count matching skills (case-insensitive)
  const matches = input.skills.filter(skill =>
    requiredSkills.some(req =>
      skill.toLowerCase().includes(req.toLowerCase())
    )
  )
  
  const skillsMatch = (matches.length / requiredSkills.length) * 100
  const aiScore = Math.round(skillsMatch * 0.8 + 20) // 20-100 score
  
  return {
    aiScore,
    skillsMatch: Math.round(skillsMatch),
    resumeMatch: 70,
    experienceMatch: 75,
  }
}
```

**Use when:** You just need quick, simple matching

---

### Example 2: ML.js - Simple Classification

```bash
pnpm add ml
```

```typescript
import { KNN } from 'ml-knn'

// Create your model (once)
let model: KNN

function trainModel(trainingData: any[]) {
  const features = trainingData.map(d => [
    d.skills.length,
    parseInt(d.experience),
    d.resumeMatch,
  ])
  const labels = trainingData.map(d => d.shouldHire ? 1 : 0)
  
  model = new KNN(features, labels, { k: 3 })
}

export function calculateCandidateScore(
  input: RankingInput
): RankingOutput {
  // Prepare features: [skillCount, yearsExp, resumeScore]
  const features = [
    input.skills.length,
    parseInt(input.experience),
    70,
  ]
  
  // Get prediction (0 or 1, convert to 0-100)
  const prediction = model.predict(features)[0]
  const aiScore = prediction * 100
  
  return {
    aiScore,
    skillsMatch: input.skills.length * 15,
    resumeMatch: 70,
    experienceMatch: (parseInt(input.experience) / 5) * 100,
  }
}
```

**Use when:** You have training data and want ML-based scoring

---

### Example 3: TensorFlow.js - Neural Network

```bash
pnpm add @tensorflow/tfjs
```

```typescript
import * as tf from '@tensorflow/tfjs'

let model: tf.LayersModel

// Load your pre-trained model
export async function loadTensorFlowModel() {
  model = await tf.loadLayersModel(
    'indexeddb://my-ranking-model'
  )
}

export function calculateCandidateScore(
  input: RankingInput
): RankingOutput {
  // Prepare input features
  const features = tf.tensor2d([
    [
      input.skills.length,
      parseInt(input.experience),
      input.email.endsWith('.edu') ? 1 : 0,
    ]
  ])
  
  // Get prediction
  const prediction = model.predict(features) as tf.Tensor
  const predictionData = prediction.dataSync()
  const aiScore = Math.round(predictionData[0] * 100)
  
  // Cleanup
  features.dispose()
  prediction.dispose()
  
  return {
    aiScore: Math.min(100, Math.max(0, aiScore)),
    skillsMatch: 80,
    resumeMatch: 75,
    experienceMatch: 70,
  }
}
```

**Use when:** You have a complex model with high accuracy needs

---

### Example 4: Call Python Backend

In `lib/ranking-model.ts`:

```typescript
export async function calculateCandidateScore(
  input: RankingInput,
  jobRequirements?: JobRequirements
): Promise<RankingOutput> {
  const response = await fetch('http://localhost:5000/api/rank-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidate: input,
      jobRequirements,
    }),
  })
  
  return response.json()
}
```

Then run your Python service:
```bash
cd python-backend
pip install flask flask-cors numpy scikit-learn
python ranking_service.py
```

See `ranking_service_example.py` for the Python implementation.

**Use when:** You already have a Python ML model

---

### Example 5: Call External AI API (HuggingFace, OpenAI, etc.)

```typescript
export async function calculateCandidateScore(
  input: RankingInput
): Promise<RankingOutput> {
  const apiKey = process.env.NEXT_PUBLIC_AI_API_KEY
  
  const response = await fetch('https://api-inference.huggingface.co/models/your-model', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: `Rank this candidate: ${JSON.stringify(input)}`,
    }),
  })
  
  const result = await response.json()
  
  // Parse API response into RankingOutput format
  return parseApiResponse(result)
}
```

**Use when:** You want to leverage state-of-the-art language models

---

## 🔌 Integration Methods Comparison

| Method | Speed | Accuracy | Cost | Complexity |
|--------|-------|----------|------|------------|
| Keyword Match | ⚡ Fast | ⭐ Basic | Free | ⭐ Simple |
| ML.js | ⚡ Fast | ⭐⭐ Good | Free | ⭐⭐ Medium |
| TensorFlow.js | ⚡ Fast | ⭐⭐⭐ Great | Free | ⭐⭐⭐ Hard |
| Python Backend | 🔄 Slower | ⭐⭐⭐ Great | Free | ⭐⭐⭐ Hard |
| External API | 🔄 Slower | ⭐⭐⭐⭐ Best | $ | ⭐⭐ Medium |

---

## 🧪 Test Your Model

Create `__tests__/ranking.test.ts`:

```typescript
import { calculateCandidateScore } from '@/lib/ranking-model'

describe('Candidate Ranking', () => {
  it('should score high for exact match', () => {
    const result = calculateCandidateScore({
      name: 'Test',
      email: 'test@example.com',
      phone: '555-1234',
      experience: '5 years',
      skills: ['React', 'TypeScript'], // Match requirements
    }, {
      requiredSkills: ['React', 'TypeScript'],
      minExperience: 3,
      jobDescription: 'React developer needed',
    })
    
    expect(result.aiScore).toBeGreaterThan(80)
  })
  
  it('should score low for no match', () => {
    const result = calculateCandidateScore({
      name: 'Test',
      email: 'test@example.com',
      phone: '555-1234',
      experience: '1 year',
      skills: ['Java', 'C++'], // No match
    }, {
      requiredSkills: ['React', 'TypeScript'],
      minExperience: 3,
      jobDescription: 'React developer needed',
    })
    
    expect(result.aiScore).toBeLessThan(50)
  })
})
```

Run tests:
```bash
npm test
```

---

## 🔧 Common Customizations

### Adjust Weights
```typescript
const aiScore = Math.round(
  skillsMatch * 0.5 +      // 50% weight
  experienceMatch * 0.3 +  // 30% weight
  resumeMatch * 0.2        // 20% weight
)
```

### Add Education Scoring
```typescript
function calculateEducationScore(resumeText: string): number {
  const hasMS = resumeText.includes('Master')
  const hasPhD = resumeText.includes('PhD')
  
  if (hasPhD) return 100
  if (hasMS) return 85
  return 60
}

const aiScore = Math.round(
  skillsMatch * 0.35 +
  experienceMatch * 0.35 +
  educationScore * 0.2 +
  resumeMatch * 0.1
)
```

### Filter by Technology Stack
```typescript
const techStack = ['React', 'Node.js', 'TypeScript']
const hasAllRequired = techStack.every(tech =>
  input.skills.some(skill => 
    skill.toLowerCase().includes(tech.toLowerCase())
  )
)

if (!hasAllRequired) {
  return {
    aiScore: 30,
    skillsMatch: 40,
    // ... rest
  }
}
```

### Penalize Job Hoppers
```typescript
const jobChanges = (resumeText.match(/FY|Fiscal Year|\d{4}/g) || []).length
const stabilityPenalty = jobChanges > 5 ? 15 : 0
const aiScore = Math.round(finalScore - stabilityPenalty)
```

---

## 🚨 Debugging

### Enable Logging
```typescript
export function calculateCandidateScore(
  input: RankingInput,
  jobRequirements?: JobRequirements
): RankingOutput {
  console.log('Ranking:', input.name)
  console.log('Required skills:', jobRequirements?.requiredSkills)
  
  // ... your logic ...
  
  console.log('Final score:', aiScore)
  return { aiScore, ... }
}
```

### Test with Console
```typescript
// In browser console
const { calculateCandidateScore } = await import('@/lib/ranking-model.ts')
calculateCandidateScore({
  name: 'Test',
  email: 'test@example.com',
  phone: '555-1234',
  experience: '5 years',
  skills: ['React', 'TypeScript']
})
```

---

## 📊 Monitor Performance

Track ranking quality:

```typescript
interface RankingMetrics {
  candidateName: string
  score: number
  hired: boolean
  performanceRating: number
}

// After hiring, log the actual performance
const metrics: RankingMetrics[] = [
  {
    candidateName: 'Emily Chen',
    score: 95,
    hired: true,
    performanceRating: 4.8, // Actual performance
  },
]

// Calculate ranking accuracy
const accuracy = metrics.filter(
  m => (m.score > 80) === (m.performanceRating > 4)
).length / metrics.length

console.log(`Ranking Accuracy: ${accuracy}`)
```

---

## 🎯 Next Steps

1. **Choose your method** (Keyword, ML.js, TensorFlow, Python Backend, or API)
2. **Update `lib/ranking-model.ts`** with your algorithm
3. **Test with sample data** using the test file
4. **Deploy and monitor** the results
5. **Iterate** based on hiring outcomes

---

## ❓ FAQ

**Q: Should I use local or backend calculation?**
- Local: Faster, no server needed, good for simple logic
- Backend: Better for complex ML models, data science integrations

**Q: Can I use my existing Python model?**
- Yes! Use the Python backend example or HTTP API approach

**Q: How do I handle resume PDFs?**
- Parse PDFs first: `npm install pdf-parse`
- Convert to text before passing to ranking model

**Q: Can I update the model after deployment?**
- If using local JS: Yes, just redeploy frontend
- If using backend: Yes, retrain without redeploying frontend

---

## 📚 Resources

- [Scikit-learn](https://scikit-learn.org/) - Python ML library
- [TensorFlow.js](https://www.tensorflow.org/js) - JS ML framework
- [ML.js](https://github.com/mljs/ml) - Pure JS ML library
- [HuggingFace Models](https://huggingface.co/models) - Pre-trained models

---

Happy ranking! 🎯
