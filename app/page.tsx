"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

type VoteValue = 1 | -1

type Caption = {
  id: string
  content: string
  image_id?: string | null
  image_url?: string | null
  imageUrl?: string | null
  url?: string | null
  image?: CaptionImage | CaptionImage[] | null
  images?: CaptionImage | CaptionImage[] | null
  [key: string]: unknown
}

type CaptionImage = {
  id?: string | null
  image_url?: string | null
  imageUrl?: string | null
  url?: string | null
  public_url?: string | null
}

type GeneratedCaption = {
  id?: string
  content?: string
  caption?: string
  text?: string
  image_url?: string | null
  imageUrl?: string | null
  [key: string]: unknown
}

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]

const CAPTION_SELECTS = [
  "id, content, image_id, images(id, url)",
  "id, content, image_id, image:images(id, url)",
  "id, content, image_id, image_url",
  "id, content, image_id, imageUrl",
  "id, content, image_id, url",
  "id, content, image_id",
  "id, content",
]

export default function Home() {
  const [supabase] = useState(() => createClient())

  const [user, setUser] = useState<User | null>(null)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)
  const [userVotes, setUserVotes] = useState<Record<string, VoteValue>>({})
  const [voteMessages, setVoteMessages] = useState<Record<string, string>>({})

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [generatedCaptions, setGeneratedCaptions] = useState<GeneratedCaption[]>([])
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadVotes = useCallback(
    async (captionIds: string[]) => {
      if (!user || captionIds.length === 0) {
        setUserVotes({})
        return
      }

      const { data, error } = await supabase
        .from("caption_votes")
        .select("caption_id, vote_value")
        .eq("profile_id", user.id)
        .in("caption_id", captionIds)

      if (error) {
        console.error("Error loading votes:", error)
        setUserVotes({})
        return
      }

      const nextVotes: Record<string, VoteValue> = {}

      for (const vote of data || []) {
        if (vote.vote_value === 1 || vote.vote_value === -1) {
          nextVotes[vote.caption_id] = vote.vote_value
        }
      }

      setUserVotes(nextVotes)
    },
    [supabase, user]
  )

  const attachImageUrls = useCallback(
    async (loadedCaptions: Caption[]) => {
      const captionsMissingImageUrl = loadedCaptions.filter(
        (caption) => caption.image_id && !getCaptionImageUrl(caption)
      )

      const imageIds = Array.from(
        new Set(captionsMissingImageUrl.map((caption) => caption.image_id).filter(Boolean))
      ) as string[]

      if (imageIds.length === 0) {
        return loadedCaptions
      }

      const { data, error } = await supabase.from("images").select("id, url").in("id", imageIds)

      if (error) {
        console.error("Error loading caption images:", error)
        return loadedCaptions
      }

      const imageUrlById = new Map((data || []).map((image) => [image.id, image.url]))

      return loadedCaptions.map((caption) => {
        const imageUrl = caption.image_id ? imageUrlById.get(caption.image_id) : null

        return imageUrl ? { ...caption, image_url: imageUrl } : caption
      })
    },
    [supabase]
  )

  const loadCaptions = useCallback(async () => {
    if (!user) {
      setCaptions([])
      setUserVotes({})
      setLoading(false)
      return
    }

    setLoading(true)

    let loadedCaptions: Caption[] = []
    let lastError: unknown = null

    for (const selectColumns of CAPTION_SELECTS) {
      const { data, error } = await supabase
        .from("captions")
        .select(selectColumns)
        .limit(20)

      if (!error) {
        loadedCaptions = (data || []) as unknown as Caption[]
        lastError = null
        break
      }

      lastError = error
    }

    if (lastError) {
      console.error("Error loading captions:", lastError)
      setCaptions([])
    } else {
      const captionsWithImages = await attachImageUrls(loadedCaptions)

      setCaptions(captionsWithImages)
      await loadVotes(captionsWithImages.map((caption) => caption.id))
    }

    setLoading(false)
  }, [attachImageUrls, loadVotes, supabase, user])

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      setUser(user)
      setLoading(false)
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    loadCaptions()
  }, [loadCaptions])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function handleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setCaptions([])
    setGeneratedCaptions([])
    setGeneratedImageUrl(null)
    setFile(null)
    setGenerationError(null)
    setGenerationSuccess(null)
    setUserVotes({})
    setVoteMessages({})

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }

  async function handleVote(captionId: string, voteValue: VoteValue) {
    if (!user) {
      setVoteMessages((current) => ({
        ...current,
        [captionId]: "Log in to save a vote.",
      }))
      return
    }

    try {
      setSubmittingVoteId(captionId)
      setVoteMessages((current) => ({ ...current, [captionId]: "Saving vote..." }))

      const { data: existingVotes, error: existingVoteError } = await supabase
        .from("caption_votes")
        .select("id")
        .eq("caption_id", captionId)
        .eq("profile_id", user.id)
        .limit(1)

      if (existingVoteError) {
        throw existingVoteError
      }

      const existingVote = existingVotes?.[0]
      const votePayload = {
        vote_value: voteValue,
        modified_by_user_id: user.id,
      }

      const { error } = existingVote
        ? await supabase
            .from("caption_votes")
            .update(votePayload)
            .eq("id", existingVote.id)
        : await supabase.from("caption_votes").insert({
            caption_id: captionId,
            vote_value: voteValue,
            profile_id: user.id,
            created_by_user_id: user.id,
            modified_by_user_id: user.id,
            is_from_study: false,
          })

      if (error) {
        throw error
      }

      setUserVotes((current) => ({ ...current, [captionId]: voteValue }))
      setVoteMessages((current) => ({
        ...current,
        [captionId]: voteValue === 1 ? "Upvote saved." : "Downvote saved.",
      }))
    } catch (err) {
      console.error("Vote error:", err)
      setVoteMessages((current) => ({
        ...current,
        [captionId]: "Vote could not be saved. Please try again.",
      }))
    } finally {
      setSubmittingVoteId(null)
    }
  }

  function handleSelectedFile(selectedFile: File | null) {
    setGenerationError(null)
    setGenerationSuccess(null)
    setGeneratedCaptions([])
    setGeneratedImageUrl(null)

    if (!selectedFile) {
      clearSelectedFile()
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      clearSelectedFile()
      setGenerationError("Unsupported image type. Please upload jpg, png, webp, gif, or heic.")
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      clearSelectedFile()
      setGenerationError("File is too large. Please upload an image smaller than 10MB.")
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setFile(selectedFile)
    setPreviewUrl(URL.createObjectURL(selectedFile))
  }

  function clearSelectedFile() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setFile(null)
    setPreviewUrl(null)
    setGeneratedImageUrl(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    handleSelectedFile(event.target.files?.[0] ?? null)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    handleSelectedFile(event.dataTransfer.files?.[0] ?? null)
  }

  async function handleGenerateCaptions() {
    if (!user) {
      setGenerationError("You must be logged in to generate captions.")
      return
    }

    if (!file) {
      setGenerationError("Choose an image first, then preview it before generating captions.")
      return
    }

    try {
      setGeneratingCaptions(true)
      setGenerationError(null)
      setGenerationSuccess(null)
      setGeneratedCaptions([])
      setGeneratedImageUrl(null)

      const presignResponse = await fetch("/api/captions/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: file.type,
        }),
      })

      const presignData = await presignResponse.json()

      if (!presignResponse.ok) {
        throw new Error(presignData?.error || "Failed to get presigned URL.")
      }

      const { presignedUrl, cdnUrl } = presignData

      if (!presignedUrl || !cdnUrl) {
        throw new Error("Presign response is missing presignedUrl or cdnUrl.")
      }

      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image to presigned URL.")
      }

      const generateResponse = await fetch("/api/captions/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: cdnUrl,
        }),
      })

      const generateData = await generateResponse.json()

      if (!generateResponse.ok) {
        throw new Error(generateData?.error || "Failed to generate captions.")
      }

      const generated = Array.isArray(generateData?.captions) ? generateData.captions : []
      const captionsWithImage = generated.map((caption: GeneratedCaption) => ({
        ...caption,
        image_url: caption.image_url ?? caption.imageUrl ?? cdnUrl,
      }))

      setGeneratedImageUrl(cdnUrl)
      setGeneratedCaptions(captionsWithImage)
      setGenerationSuccess(`${captionsWithImage.length} captions generated for this image.`)
      await loadCaptions()
    } catch (error) {
      console.error("Caption generation error:", error)
      setGenerationError(
        error instanceof Error ? error.message : "Something went wrong while generating captions."
      )
    } finally {
      setGeneratingCaptions(false)
    }
  }

  function renderGeneratedCaptionText(item: GeneratedCaption) {
    return item.content || item.caption || item.text || JSON.stringify(item)
  }

  function getCaptionImageUrl(caption: Caption | GeneratedCaption) {
    if (caption.image_url || caption.imageUrl || caption.url) {
      return (caption.image_url || caption.imageUrl || caption.url) as string
    }

    const possibleImages = "images" in caption ? caption.images : "image" in caption ? caption.image : null
    const image = Array.isArray(possibleImages) ? possibleImages[0] : possibleImages

    return image?.image_url || image?.imageUrl || image?.url || image?.public_url || null
  }

  function VoteControls({ captionId }: { captionId: string }) {
    const selectedVote = userVotes[captionId]
    const isSaving = submittingVoteId === captionId

    return (
      <div className="vote-area">
        <div className="vote-buttons" aria-label="Vote on caption">
          <button
            className={`vote-button ${selectedVote === 1 ? "is-selected up" : ""}`}
            onClick={() => handleVote(captionId, 1)}
            disabled={isSaving}
            type="button"
          >
            <span aria-hidden="true">▲</span>
            Upvote
          </button>

          <button
            className={`vote-button ${selectedVote === -1 ? "is-selected down" : ""}`}
            onClick={() => handleVote(captionId, -1)}
            disabled={isSaving}
            type="button"
          >
            <span aria-hidden="true">▼</span>
            Downvote
          </button>
        </div>

        {voteMessages[captionId] && (
          <p className="inline-status" role="status">
            {voteMessages[captionId]}
          </p>
        )}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <div className="page-frame">
        <header className="app-header">
          <div>
            <p className="eyebrow">Caption creation and rating app</p>
            <h1>Crackd Caption Playground</h1>
            <p>
              Upload an image, generate AI captions, then compare captions with their images and save
              the vote that matches your preference.
            </p>
          </div>
        </header>

        <section className="account-bar" aria-label="Account">
          {user ? (
            <>
              <div>
                <p className="label-text">Signed in</p>
                <p className="account-email">{user.email}</p>
              </div>

              <div className="account-actions">
                <a className="secondary-link" href="/dashboard">
                  Account status
                </a>
                <button className="secondary-button" onClick={handleLogout} type="button">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="label-text">Login required</p>
                <p className="account-copy">Log in with Google to generate captions and save votes.</p>
              </div>
              <button className="primary-button" onClick={handleLogin} type="button">
                Login with Google
              </button>
            </>
          )}
        </section>

        {user && (
          <section className="workflow-panel" aria-labelledby="generate-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Step-by-step workflow</p>
                <h2 id="generate-heading">Generate Captions from an Image</h2>
                <p>Choose an image, confirm the preview, generate captions, then review the results.</p>
              </div>
            </div>

            <ol className="step-list" aria-label="Caption generation steps">
              <li>Choose or drop an image.</li>
              <li>Check that the preview matches your file.</li>
              <li>Generate captions and review the completed results.</li>
              <li>Vote on saved caption cards below.</li>
            </ol>

            <div className="generator-grid">
              <div
                className={`drop-zone ${previewUrl ? "has-file" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                  onChange={handleFileChange}
                  className="hidden-input"
                />

                <p className="label-text">Image upload</p>
                <h3>{file ? file.name : "Drop an image here"}</h3>
                <p>Supported types: jpg, png, webp, gif, heic. Maximum size: 10MB.</p>

                <div className="upload-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Image
                  </button>
                  {file && (
                    <button className="ghost-button" type="button" onClick={clearSelectedFile}>
                      Clear
                    </button>
                  )}
                </div>

                {!file && <p className="hint-text">Generate stays locked until an image is selected.</p>}
              </div>

              <div className="preview-panel">
                {previewUrl ? (
                  <>
                    <p className="label-text">Image preview</p>
                    <img src={previewUrl} alt="Selected upload preview" />
                  </>
                ) : (
                  <div className="empty-preview">
                    <p className="label-text">Image preview</p>
                    <p>Your selected image will appear here before captions are generated.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="generation-actions">
              <button
                className="primary-button"
                onClick={handleGenerateCaptions}
                disabled={!file || generatingCaptions}
                type="button"
              >
                {generatingCaptions ? "Generating..." : "Generate Captions"}
              </button>

              {generationError && (
                <p className="error-message" role="alert">
                  {generationError}
                </p>
              )}

              {generationSuccess && (
                <p className="success-message" role="status">
                  {generationSuccess}
                </p>
              )}
            </div>

            {generatedCaptions.length > 0 && (
              <div className="generated-results">
                <div className="section-heading compact">
                  <div>
                    <h3>Generated Captions</h3>
                    <p>These results are paired with the uploaded image so the caption context stays clear.</p>
                  </div>
                  <span className="count-pill">{generatedCaptions.length} results</span>
                </div>

                <div className="caption-grid">
                  {generatedCaptions.map((item, index) => {
                    const captionId = item.id
                    const imageUrl = getCaptionImageUrl(item) || generatedImageUrl

                    return (
                      <article className="caption-card" key={captionId ?? index}>
                        {imageUrl && (
                          <img
                            className="caption-image"
                            src={imageUrl}
                            alt="Image associated with generated caption"
                          />
                        )}
                        <div className="caption-body">
                          <p className="label-text">Generated caption</p>
                          <p className="caption-text">{renderGeneratedCaptionText(item)}</p>
                          {captionId ? (
                            <VoteControls captionId={captionId} />
                          ) : (
                            <p className="inline-status">
                              This generated caption is shown for review. Saved database captions can be
                              voted on below.
                            </p>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="saved-section" aria-labelledby="saved-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Saved database captions</p>
              <h2 id="saved-heading">Existing Captions</h2>
              <p>
                Vote on captions that are already saved. Each card keeps the caption next to its
                associated image when the database provides one.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading captions...</div>
          ) : !user ? (
            <div className="empty-state">Log in above to browse saved captions and submit votes.</div>
          ) : captions.length === 0 ? (
            <div className="empty-state">No saved captions found yet.</div>
          ) : (
            <div className="caption-grid">
              {captions.map((caption) => {
                const imageUrl = getCaptionImageUrl(caption)
                const hasVote = userVotes[caption.id] !== undefined

                return (
                  <article className={`caption-card ${hasVote ? "has-vote" : ""}`} key={caption.id}>
                    {imageUrl ? (
                      <img className="caption-image" src={imageUrl} alt="Image associated with caption" />
                    ) : (
                      <div className="missing-image">
                        <p className="label-text">No image found</p>
                        <p>Add an image URL or image relation for this caption in the database.</p>
                      </div>
                    )}

                    <div className="caption-body">
                      <p className="label-text">Caption</p>
                      <p className="caption-text">{caption.content}</p>
                      <VoteControls captionId={caption.id} />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
