/**
 * Hook for calculating candidate rankings
 * 
 * Usage:
 * const { rankCandidates, isLoading, error } = useRankingCalculator()
 * const rankedCandidates = rankCandidates(candidates, jobRequirements)
 */

import { useState, useCallback } from "react"
import {
  calculateCandidateScore,
  calculateCandidateScoreViaAPI,
  JobRequirements,
  RankingInput,
  RankingOutput,
} from "@/lib/ranking-model"

interface UseRankingCalculatorOptions {
  useAPI?: boolean // Set true to use backend API instead of local calculation
}

export function useRankingCalculator(options: UseRankingCalculatorOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Calculate rankings for multiple candidates
   */
  const rankCandidates = useCallback(
    async (
      candidates: RankingInput[],
      jobRequirements?: JobRequirements
    ): Promise<(RankingInput & RankingOutput)[]> => {
      setIsLoading(true)
      setError(null)

      try {
        if (options.useAPI) {
          // Use backend API for ranking
          const rankedPromises = candidates.map(candidate =>
            calculateCandidateScoreViaAPI(candidate, jobRequirements)
          )
          const rankingResults = await Promise.all(rankedPromises)

          return candidates.map((candidate, index) => ({
            ...candidate,
            ...rankingResults[index],
          }))
        } else {
          // Use local calculation
          return candidates.map(candidate => ({
            ...candidate,
            ...calculateCandidateScore(candidate, jobRequirements),
          }))
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to rank candidates"
        setError(errorMessage)
        console.error("Ranking error:", errorMessage)

        // Fallback: return candidates with default scores
        return candidates.map(candidate => ({
          ...candidate,
          aiScore: 50,
          resumeMatch: 50,
          skillsMatch: 50,
          experienceMatch: 50,
          reasoning: "Using fallback scoring due to ranking service unavailable",
        }))
      } finally {
        setIsLoading(false)
      }
    },
    [options.useAPI]
  )

  /**
   * Calculate ranking for a single candidate
   */
  const rankCandidate = useCallback(
    async (
      candidate: RankingInput,
      jobRequirements?: JobRequirements
    ): Promise<RankingInput & RankingOutput> => {
      setIsLoading(true)
      setError(null)

      try {
        const rankingResult = options.useAPI
          ? await calculateCandidateScoreViaAPI(candidate, jobRequirements)
          : calculateCandidateScore(candidate, jobRequirements)

        return {
          ...candidate,
          ...rankingResult,
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to rank candidate"
        setError(errorMessage)
        console.error("Ranking error:", errorMessage)

        return {
          ...candidate,
          aiScore: 50,
          resumeMatch: 50,
          skillsMatch: 50,
          experienceMatch: 50,
          reasoning: "Using fallback scoring due to error",
        }
      } finally {
        setIsLoading(false)
      }
    },
    [options.useAPI]
  )

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    rankCandidates,
    rankCandidate,
    isLoading,
    error,
    clearError,
  }
}
