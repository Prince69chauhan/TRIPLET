"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { documentService } from "@/lib/documentService"
import {
  CheckSquare,
  FileText,
  Trash2,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  Pencil,
  Check,
  X,
  AlertCircle,
  Loader2,
  FilePlus,
  Search,
  XCircle,
} from "lucide-react"

interface Document {
  id: string
  display_name: string
  original_name: string
  file_size_bytes: number
  mime_type: string
  created_at: string
  download_url: string
}

const MAX_BATCH_SIZE_BYTES = 25 * 1024 * 1024

function formatSize(bytes: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function getDocumentTypeLabel(mimeType: string): "pdf" | "png" | "doc" | "jpg" | "other" {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes("pdf")) return "pdf"
  if (normalized.includes("png")) return "png"
  if (normalized.includes("wordprocessingml") || normalized.includes("msword")) return "doc"
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg"
  return "other"
}

function canPreviewDocument(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase()
  return normalized.includes("pdf") || normalized.includes("png") || normalized.includes("jpeg") || normalized.includes("jpg")
}

export function DocumentsSection() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [uploadError, setUploadError] = useState("")
  const [dupError, setDupError] = useState("")
  const [actionError, setActionError] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameError, setRenameError] = useState("")
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const [downloadingIds, setDownloadingIds] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([])
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const debouncedSearch = useDebouncedValue(search, 250)

  const loadDocs = async () => {
    try {
      const data = await documentService.listDocuments()
      setDocs(data.documents || [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocs()
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  const replacePreviewUrl = (nextUrl: string | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    previewUrlRef.current = nextUrl
    setPreviewUrl(nextUrl ?? "")
  }

  const closePreview = () => {
    setPreviewDoc(null)
    setPreviewLoading(false)
    setPreviewExpanded(false)
    replacePreviewUrl(null)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const totalBatchSize = files.reduce((sum, file) => sum + file.size, 0)

    setUploadError("")
    setDupError("")
    setActionError("")

    if (totalBatchSize > MAX_BATCH_SIZE_BYTES) {
      setUploadError(
        `Selected files total ${formatSize(totalBatchSize)}. Maximum combined upload per batch is ${formatSize(MAX_BATCH_SIZE_BYTES)}. Please split them into smaller batches.`,
      )
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setUploading(true)
    setUploadingCount(files.length)

    try {
      const results = await Promise.allSettled(
        files.map((file) => documentService.uploadDocument(file)),
      )

      const uploadedDocs: Document[] = []
      const duplicateMessages: string[] = []
      const uploadMessages: string[] = []

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          uploadedDocs.push(result.value as Document)
          return
        }

        const err = result.reason as any
        const status = err?.response?.status
        const detail = err?.response?.data?.detail || `Failed to upload ${files[index]?.name || "file"}.`

        if (status === 409) {
          duplicateMessages.push(detail)
        } else {
          uploadMessages.push(detail)
        }
      })

      if (uploadedDocs.length > 0) {
        setDocs((prev) => {
          const merged = [...uploadedDocs, ...prev]
          return merged.filter((doc, index, arr) => arr.findIndex((other) => other.id === doc.id) === index)
        })
      }

      setDupError(duplicateMessages.join(" "))
      setUploadError(uploadMessages.join(" "))
    } finally {
      setUploading(false)
      setUploadingCount(0)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const requestDelete = (docIds: string[]) => {
    setActionError("")
    setConfirmDeleteIds(docIds)
    setConfirmDeleteOpen(true)
  }

  const handleDeleteConfirmed = async () => {
    if (confirmDeleteIds.length === 0) return
    setDeletingIds(confirmDeleteIds)
    try {
      if (confirmDeleteIds.length === 1) {
        await documentService.deleteDocument(confirmDeleteIds[0])
      } else {
        await documentService.bulkDeleteDocuments(confirmDeleteIds)
      }
      setDocs((prev) => prev.filter((doc) => !confirmDeleteIds.includes(doc.id)))
      setSelectedDocIds((prev) => prev.filter((docId) => !confirmDeleteIds.includes(docId)))
      setConfirmDeleteOpen(false)
      setConfirmDeleteIds([])
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || "Failed to delete document(s). Please try again.")
    } finally {
      setDeletingIds([])
    }
  }

  const startRename = (doc: Document) => {
    setRenamingId(doc.id)
    setRenameValue(doc.display_name)
    setRenameError("")
    setActionError("")
  }

  const confirmRename = async (docId: string) => {
    const nextName = renameValue.trim()
    if (!nextName) {
      setRenameError("Name cannot be empty.")
      return
    }

    const duplicate = docs.find(
      (doc) => doc.id !== docId && doc.display_name.trim().toLowerCase() === nextName.toLowerCase(),
    )
    if (duplicate) {
      setRenameError(`A document named "${duplicate.display_name}" already exists.`)
      return
    }

    try {
      await documentService.renameDocument(docId, nextName)
      setDocs((prev) =>
        prev.map((doc) =>
          doc.id === docId ? { ...doc, display_name: nextName } : doc,
        ),
      )
      setRenameError("")
    } catch (err: any) {
      setRenameError(err?.response?.data?.detail || "Failed to rename document. Please try again.")
    } finally {
      setRenamingId(null)
    }
  }

  const handlePreview = async (doc: Document) => {
    setActionError("")
    if (!canPreviewDocument(doc.mime_type)) {
      setActionError("Preview is available for PDF and image documents only. Download DOCX files to open them.")
      return
    }

    setPreviewDoc(doc)
    setPreviewLoading(true)

    try {
      const blob = await documentService.getDocumentBlob(doc.id)
      replacePreviewUrl(URL.createObjectURL(blob))
    } catch (err: any) {
      closePreview()
      setActionError(err?.message || "Failed to preview document. Please try again.")
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownload = async (doc: Document) => {
    setActionError("")
    setDownloadingIds((prev) => Array.from(new Set([...prev, doc.id])))
    try {
      await documentService.downloadDocument(doc.id, doc.display_name || doc.original_name)
    } catch (err: any) {
      setActionError(err?.message || "Failed to download document. Please try again.")
    } finally {
      setDownloadingIds((prev) => prev.filter((id) => id !== doc.id))
    }
  }

  const filteredDocs = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    const nextDocs = docs.filter((doc) => {
      const docType = getDocumentTypeLabel(doc.mime_type)
      const matchesSearch =
        !query ||
        doc.display_name.toLowerCase().includes(query) ||
        doc.original_name.toLowerCase().includes(query)
      const matchesType = typeFilter === "all" || docType === typeFilter
      return matchesSearch && matchesType
    })

    return [...nextDocs].sort((a, b) => {
      if (sortBy === "name-asc") return a.display_name.localeCompare(b.display_name)
      if (sortBy === "name-desc") return b.display_name.localeCompare(a.display_name)
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [debouncedSearch, docs, sortBy, typeFilter])

  const allVisibleSelected = filteredDocs.length > 0 && filteredDocs.every((doc) => selectedDocIds.includes(doc.id))

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedDocIds((prev) => Array.from(new Set([...prev, ...filteredDocs.map((doc) => doc.id)])))
      return
    }
    setSelectedDocIds((prev) => prev.filter((docId) => !filteredDocs.some((doc) => doc.id === docId)))
  }

  const toggleDocumentSelection = (docId: string, checked: boolean) => {
    setSelectedDocIds((prev) => {
      if (checked) return Array.from(new Set([...prev, docId]))
      return prev.filter((id) => id !== docId)
    })
  }

  const handleRowSelection = (event: React.MouseEvent<HTMLDivElement>, docId: string) => {
    if (!selectionMode) return

    const target = event.target as HTMLElement
    if (target.closest("button, a, input, textarea, [data-slot='checkbox'], [data-slot='checkbox-indicator']")) {
      return
    }

    toggleDocumentSelection(docId, !selectedDocIds.includes(docId))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{docs.length}</p>
              <p className="text-sm text-muted-foreground">Documents Uploaded</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6 flex items-center justify-center">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              multiple
              onChange={handleUpload}
            />
            <Button
              onClick={() => {
                setDupError("")
                setUploadError("")
                setActionError("")
                fileInputRef.current?.click()
              }}
              disabled={uploading}
              className="h-12 w-full border border-primary/35 bg-primary text-base text-primary-foreground"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Uploading {uploadingCount > 0 ? `${uploadingCount} file${uploadingCount > 1 ? "s" : ""}` : "files"}...
                </>
              ) : (
                <>
                  <FilePlus className="h-5 w-5 mr-2" />+ Upload New
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {dupError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {dupError}
          <button onClick={() => setDupError("")} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {uploadError}
          <button onClick={() => setUploadError("")} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
          <button onClick={() => setActionError("")} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="mb-4 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground text-lg">My Documents</h3>
              <p className="text-sm text-muted-foreground">
                All your uploaded documents for job applications
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search documents by name..."
                  className="bg-input border-border pl-10 text-foreground"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row xl:shrink-0">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full bg-input border-border text-foreground sm:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="newest">Uploaded Date</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="name-asc">A to Z</SelectItem>
                    <SelectItem value="name-desc">Z to A</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full bg-input border-border text-foreground sm:w-[160px]">
                    <SelectValue placeholder="File type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">All Files</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="doc">DOC</SelectItem>
                    <SelectItem value="jpg">JPG</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant={selectionMode ? "default" : "outline"}
                  onClick={() => {
                    setSelectionMode((prev) => {
                      if (prev) {
                        setSelectedDocIds([])
                      }
                      return !prev
                    })
                    setActionError("")
                  }}
                  className={selectionMode ? "border border-primary/35 bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}
                >
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {selectionMode ? "Exit Select" : "Select"}
                </Button>
              </div>
            </div>

            {selectionMode && (
              <div className="flex flex-col gap-3 rounded-lg bg-secondary/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={allVisibleSelected} onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))} />
                    <span className="text-sm text-foreground">Select all visible</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedDocIds.length} selected
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => requestDelete(selectedDocIds)}
                  disabled={selectedDocIds.length === 0 || deletingIds.length > 0}
                  className="border border-red-500/35 sm:w-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="font-medium text-foreground">No documents yet</p>
              <p className="text-sm text-muted-foreground">
                Click Upload New to add your first document
              </p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="space-y-3 py-12 text-center">
              <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-foreground">No matching documents found</p>
              <p className="text-sm text-muted-foreground">
                Try changing your search, sort, or file type filter
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={(event) => handleRowSelection(event, doc.id)}
                  className={`flex items-center gap-3 rounded-lg p-4 transition-colors ${
                    selectionMode
                      ? "cursor-pointer bg-secondary/30 hover:bg-secondary/50"
                      : "bg-secondary/30 hover:bg-secondary/50"
                  }`}
                >
                  {selectionMode && (
                    <Checkbox
                      checked={selectedDocIds.includes(doc.id)}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={(checked) => toggleDocumentSelection(doc.id, Boolean(checked))}
                    />
                  )}

                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {renamingId === doc.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={renameValue}
                            onChange={(e) => {
                              setRenameValue(e.target.value)
                              setRenameError("")
                            }}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmRename(doc.id)
                              if (e.key === "Escape") {
                                setRenamingId(null)
                                setRenameError("")
                              }
                            }}
                            className="bg-input border-border text-foreground h-8 text-sm"
                            autoFocus
                          />
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              confirmRename(doc.id)
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-green-500/30 text-green-500 transition-colors hover:bg-green-500/10 hover:text-green-400"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              setRenamingId(null)
                              setRenameError("")
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {renameError && (
                          <p className="text-xs text-red-500">{renameError}</p>
                        )}
                      </div>
                    ) : (
                      <p className="font-medium text-foreground text-sm truncate">
                        {doc.display_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.mime_type} - {formatSize(doc.file_size_bytes)} - Uploaded{" "}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        void handlePreview(doc)
                      }}
                      disabled={selectionMode || previewLoading}
                      className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                      title={canPreviewDocument(doc.mime_type) ? "View" : "Preview available for PDF and image files"}
                    >
                      <Eye className="h-4 w-4" />
                    </button>

                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        startRename(doc)
                      }}
                      disabled={selectionMode}
                      className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                      title="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDownload(doc)
                      }}
                      disabled={downloadingIds.includes(doc.id)}
                      className="rounded-lg border border-primary/30 p-2 text-primary transition-colors hover:bg-secondary hover:text-primary/80 disabled:opacity-50"
                      title="Download"
                    >
                      {downloadingIds.includes(doc.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        requestDelete([doc.id])
                      }}
                      disabled={deletingIds.includes(doc.id)}
                      className="rounded-lg border border-red-500/30 p-2 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingIds.includes(doc.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Supported formats: PDF, DOCX, JPG, PNG - Max 10MB per file - Max {formatSize(MAX_BATCH_SIZE_BYTES)} per batch
      </p>

      <Dialog open={Boolean(previewDoc)} onOpenChange={(open) => {
        if (!open) closePreview()
      }}>
        <DialogContent className={`${previewExpanded ? "h-[92vh] max-w-[96vw]" : "max-w-4xl"} border-border bg-card`}>
          <DialogHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-foreground">
                {previewDoc?.display_name || "Document preview"}
              </DialogTitle>
              <DialogDescription>
                {previewDoc ? `${getDocumentTypeLabel(previewDoc.mime_type).toUpperCase()} preview` : "Preview your uploaded document."}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={previewLoading}
              onClick={() => setPreviewExpanded((current) => !current)}
              className="border-border text-foreground"
            >
              {previewExpanded ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  Exit Full View
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  Maximize
                </>
              )}
            </Button>
          </DialogHeader>

          {previewLoading ? (
            <div className={`flex ${previewExpanded ? "h-[calc(92vh-9rem)]" : "h-[70vh]"} items-center justify-center rounded-xl border border-border bg-secondary/20`}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Preparing preview...
              </div>
            </div>
          ) : previewDoc && previewUrl ? (
            previewDoc.mime_type.toLowerCase().includes("pdf") ? (
              <iframe
                src={previewUrl}
                title={previewDoc.display_name}
                className={`${previewExpanded ? "h-[calc(92vh-9rem)]" : "h-[70vh]"} w-full rounded-xl border border-border bg-background`}
              />
            ) : (
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <img
                  src={previewUrl}
                  alt={previewDoc.display_name}
                  className={`${previewExpanded ? "max-h-[calc(92vh-10rem)]" : "max-h-[68vh]"} w-full rounded-lg object-contain`}
                />
              </div>
            )
          ) : (
            <div className="flex h-[50vh] items-center justify-center rounded-xl border border-border bg-secondary/20 text-sm text-muted-foreground">
              Preview is not available right now. Please try again.
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {confirmDeleteIds.length > 1 ? "Delete selected documents?" : "Delete this document?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteIds.length > 1
                ? `This will permanently delete ${confirmDeleteIds.length} selected documents. This action cannot be undone.`
                : "This document will be permanently deleted. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-foreground"
              onClick={() => setConfirmDeleteIds([])}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirmed}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
