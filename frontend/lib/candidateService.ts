import api from "./api"

export type CandidateProfilePayload = {
  full_name?: string
  phone?: string
  degree?: string
  branch?: string
  college?: string
  tenth_percentage?: number
  twelfth_percentage?: number
  passout_year?: number
  cgpa?: number
  has_gap?: boolean
  gap_duration_months?: number
  active_backlogs?: number
  total_backlogs?: number
}

export type ParsedSkillsResponse = {
  status: "processing" | "done"
  skills: string[]
  parsed_at?: string
}

export type SkillValidationResponse = {
  valid: boolean
  skill: string
}

export type ResumeResponse = {
  id: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  sha256_hash: string
  tamper_detected?: boolean
  is_active: boolean
  last_verified_at?: string | null
  created_at: string
  download_url: string
}

export const candidateService = {
  async getProfile() {
    return api.get("/api/candidates/profile")
  },

  async updateProfile(data: CandidateProfilePayload) {
    return api.put("/api/candidates/profile", data)
  },

  async uploadResume(file: File): Promise<ResumeResponse> {
    const formData = new FormData()
    formData.append("file", file)
    return api.postForm<ResumeResponse>("/api/candidates/resume", formData)
  },

  async getResume(): Promise<ResumeResponse> {
    return api.get<ResumeResponse>("/api/candidates/resume")
  },

  async getAllResumes(): Promise<ResumeResponse[]> {
    return api.get<ResumeResponse[]>("/api/candidates/resumes")
  },

  async deleteResume(resumeId: string): Promise<void> {
    await api.delete(`/api/candidates/resumes/${resumeId}`)
  },

  async getApplications() {
    return api.get("/api/candidates/applications")
  },

  async getParsedSkills(): Promise<ParsedSkillsResponse> {
    return api.get("/api/candidates/parsed-skills")
  },

  async validateParsedSkill(skill: string): Promise<SkillValidationResponse> {
    return api.post<SkillValidationResponse>("/api/candidates/parsed-skills/validate", { skill })
  },

  async updateParsedSkills(skills: string[]): Promise<ParsedSkillsResponse> {
    return api.put<ParsedSkillsResponse>("/api/candidates/parsed-skills", { skills })
  },
}
