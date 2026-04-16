import api from "./api"
import { getSessionValue } from "./browser-session"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type DocumentRecord = {
  id: string
  display_name: string
  original_name: string
  file_size_bytes: number
  mime_type: string
  created_at: string
  download_url: string
}

type DocumentListResponse = {
  documents: DocumentRecord[]
}

export const documentService = {
  async listDocuments() {
    return api.get<DocumentListResponse>("/api/documents")
  },

  async uploadDocument(file: File) {
    const formData = new FormData()
    formData.append("file", file)
    return api.postForm<DocumentRecord>("/api/documents/upload", formData)
  },

  async renameDocument(docId: string, displayName: string) {
    return api.patch<DocumentRecord>(`/api/documents/${docId}/rename`, {
      display_name: displayName,
    })
  },

  async deleteDocument(docId: string) {
    await api.delete(`/api/documents/${docId}`)
  },

  async bulkDeleteDocuments(docIds: string[]) {
    return api.post<{ message: string; deleted_count: number }>("/api/documents/bulk-delete", {
      doc_ids: docIds,
    })
  },

  async downloadDocument(docId: string, suggestedName: string) {
    const token = getSessionValue("access_token")
    const response = await fetch(`${BASE_URL}/api/documents/${docId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (!response.ok) {
      let detail = "Failed to download document."
      try {
        const data = await response.json() as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore non-json responses
      }
      throw new Error(detail)
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = suggestedName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  },

  async getDocumentBlob(docId: string) {
    const token = getSessionValue("access_token")
    const response = await fetch(`${BASE_URL}/api/documents/${docId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (!response.ok) {
      let detail = "Failed to preview document."
      try {
        const data = await response.json() as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore non-json responses
      }
      throw new Error(detail)
    }

    return response.blob()
  },
}
