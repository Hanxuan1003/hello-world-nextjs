"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Caption = {
  id: string
  content: string
}

type GeneratedCaption = {
  id?: string
  content?: string
  caption?: string
  text?: string
  [key: string]: any
}

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]

export default function Home() {
  const [supabase] = useState(() => createClient())

  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<Caption[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [generatedCaptions, setGeneratedCaptions] = useState<GeneratedCaption[]>([])
  const [generatingCaptions, setGeneratingCaptions] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    async function loadUserAndData() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      setUser(user)

      if (user) {
        const { data, error } = await supabase
            .from("captions")
            .select("id, content")
            .limit(20)

        if (error) {
          console.error("Error loading captions:", error)
          setData([])
        } else {
          setData(data || [])
        }
      } else {
        setData([])
      }

      setLoading(false)
    }

    loadUserAndData()

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
    async function loadCaptions() {
      if (!user) {
        setData([])
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
          .from("captions")
          .select("id, content")
          .limit(20)

      if (error) {
        console.error("Error loading captions:", error)
        setData([])
      } else {
        setData(data || [])
      }

      setLoading(false)
    }

    loadCaptions()
  }, [user, supabase])

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
    setData([])
    setGeneratedCaptions([])
    setFile(null)
    setGenerationError(null)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
  }

  async function handleVote(captionId: string, voteValue: number) {
    if (!user) {
      alert("You must be logged in to vote.")
      return
    }

    try {
      setSubmittingVoteId(captionId)

      const { error } = await supabase.from("caption_votes").insert({
        caption_id: captionId,
        vote_value: voteValue,
        profile_id: user.id,
        created_by_user_id: user.id,
        modified_by_user_id: user.id,
        is_from_study: false,
      })

      if (error) {
        console.error("Error inserting vote:", error)
        alert("Failed to submit vote. Check the console for details.")
        return
      }

      alert(voteValue === 1 ? "Upvote submitted!" : "Downvote submitted!")
    } catch (err) {
      console.error("Unexpected vote error:", err)
      alert("Something went wrong while submitting your vote.")
    } finally {
      setSubmittingVoteId(null)
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null

    setGenerationError(null)
    setGeneratedCaptions([])

    if (!selectedFile) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setFile(null)
      setPreviewUrl(null)
      return
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setFile(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl(null)
      setGenerationError("Unsupported image type. Please upload jpg, png, webp, gif, or heic.")
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setFile(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl(null)
      setGenerationError("File is too large. Please upload an image smaller than 10MB.")
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setFile(selectedFile)
    setPreviewUrl(URL.createObjectURL(selectedFile))
  }

  async function handleGenerateCaptions() {
    if (!user) {
      setGenerationError("You must be logged in to generate captions.")
      return
    }

    if (!file) {
      setGenerationError("Please select an image first.")
      return
    }

    try {
      setGeneratingCaptions(true)
      setGenerationError(null)
      setGeneratedCaptions([])

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

      console.log("Generated captions response:", generateData)

      const captions = Array.isArray(generateData?.captions)
          ? generateData.captions
          : []

      setGeneratedCaptions(captions)
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

  return (
      <main
          style={{
            minHeight: "100vh",
            background: "#f6f8fb",
            padding: "32px 20px 48px",
            fontFamily: "Arial, sans-serif",
            color: "#1f2937",
          }}
      >
        <div
            style={{
              maxWidth: "1100px",
              margin: "0 auto",
            }}
        >
          <header style={{ marginBottom: "24px" }}>
            <h1
                style={{
                  margin: 0,
                  fontSize: "36px",
                  fontWeight: 700,
                  letterSpacing: "-0.5px",
                }}
            >
              Crackd Caption Playground
            </h1>
            <p
                style={{
                  marginTop: "10px",
                  marginBottom: 0,
                  color: "#4b5563",
                  fontSize: "16px",
                  lineHeight: 1.6,
                }}
            >
              Upload an image, generate AI captions, and vote on caption quality.
            </p>
          </header>

          <section
              style={{
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "18px",
                padding: "20px",
                boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
                marginBottom: "24px",
              }}
          >
            {user ? (
                <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                >
                  <div>
                    <p
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                    >
                      Signed in
                    </p>
                    <p
                        style={{
                          margin: "8px 0 0 0",
                          fontSize: "22px",
                          fontWeight: 700,
                        }}
                    >
                      {user.email}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <button
                        onClick={handleLogout}
                        style={{
                          padding: "12px 18px",
                          borderRadius: "12px",
                          border: "1px solid #d1d5db",
                          background: "white",
                          cursor: "pointer",
                          fontSize: "15px",
                          fontWeight: 600,
                        }}
                    >
                      Logout
                    </button>

                    <a
                        href="/dashboard"
                        style={{
                          padding: "12px 18px",
                          borderRadius: "12px",
                          border: "1px solid #d1d5db",
                          background: "#111827",
                          color: "white",
                          textDecoration: "none",
                          display: "inline-block",
                          fontSize: "15px",
                          fontWeight: 600,
                        }}
                    >
                      Go to Dashboard
                    </a>
                  </div>
                </div>
            ) : (
                <div>
                  <p
                      style={{
                        marginTop: 0,
                        marginBottom: "12px",
                        fontSize: "16px",
                        color: "#374151",
                      }}
                  >
                    Please log in with Google to view, rate, and generate captions.
                  </p>
                  <button
                      onClick={handleLogin}
                      style={{
                        padding: "12px 18px",
                        borderRadius: "12px",
                        border: "none",
                        background: "#2563eb",
                        color: "white",
                        cursor: "pointer",
                        fontSize: "15px",
                        fontWeight: 600,
                        boxShadow: "0 8px 18px rgba(37, 99, 235, 0.2)",
                      }}
                  >
                    Login with Google
                  </button>
                </div>
            )}
          </section>

          {user && (
              <section
                  style={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "18px",
                    padding: "24px",
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
                    marginBottom: "28px",
                  }}
              >
                <div style={{ marginBottom: "18px" }}>
                  <h2
                      style={{
                        margin: 0,
                        fontSize: "24px",
                        fontWeight: 700,
                      }}
                  >
                    Generate Captions from an Image
                  </h2>
                  <p
                      style={{
                        margin: "8px 0 0 0",
                        color: "#6b7280",
                        lineHeight: 1.6,
                      }}
                  >
                    Upload an image and send it through the caption pipeline API.
                  </p>
                </div>

                <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: previewUrl ? "320px 1fr" : "1fr",
                      gap: "24px",
                      alignItems: "start",
                    }}
                >
                  <div>
                    <label
                        style={{
                          display: "block",
                          marginBottom: "10px",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#374151",
                        }}
                    >
                      Select an image
                    </label>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic"
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                    />

                    <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                          marginBottom: "16px",
                        }}
                    >
                      <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            padding: "12px 16px",
                            borderRadius: "12px",
                            border: "1px solid #d1d5db",
                            background: "white",
                            cursor: "pointer",
                            fontSize: "15px",
                            fontWeight: 600,
                            color: "#111827",
                          }}
                      >
                        Choose Image
                      </button>

                      <span
                          style={{
                            fontSize: "14px",
                            color: file ? "#111827" : "#6b7280",
                            wordBreak: "break-word",
                          }}
                      >
                    {file ? file.name : "No file selected"}
                  </span>
                    </div>

                    <div style={{ marginBottom: "16px", color: "#6b7280", fontSize: "14px" }}>
                      Supported types: jpg, png, webp, gif, heic
                    </div>

                    <button
                        onClick={handleGenerateCaptions}
                        disabled={!file || generatingCaptions}
                        style={{
                          padding: "12px 20px",
                          borderRadius: "12px",
                          border: "none",
                          background: !file || generatingCaptions ? "#cbd5e1" : "#111827",
                          color: !file || generatingCaptions ? "#475569" : "white",
                          cursor: !file || generatingCaptions ? "not-allowed" : "pointer",
                          fontSize: "15px",
                          fontWeight: 700,
                          boxShadow:
                              !file || generatingCaptions
                                  ? "none"
                                  : "0 10px 20px rgba(17, 24, 39, 0.18)",
                        }}
                    >
                      {generatingCaptions ? "Generating..." : "Generate Captions"}
                    </button>

                    {generationError && (
                        <p
                            style={{
                              color: "#b91c1c",
                              background: "#fef2f2",
                              border: "1px solid #fecaca",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              marginTop: "16px",
                              marginBottom: 0,
                            }}
                        >
                          {generationError}
                        </p>
                    )}
                  </div>

                  {previewUrl && (
                      <div>
                        <p
                            style={{
                              marginTop: 0,
                              marginBottom: "10px",
                              fontSize: "14px",
                              fontWeight: 700,
                              color: "#374151",
                            }}
                        >
                          Image preview
                        </p>
                        <img
                            src={previewUrl}
                            alt="Preview"
                            style={{
                              width: "100%",
                              maxWidth: "320px",
                              borderRadius: "16px",
                              border: "1px solid #e5e7eb",
                              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                              objectFit: "cover",
                            }}
                        />
                      </div>
                  )}
                </div>

                {generatedCaptions.length > 0 && (
                    <div style={{ marginTop: "28px" }}>
                      <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            flexWrap: "wrap",
                            marginBottom: "14px",
                          }}
                      >
                        <h3
                            style={{
                              margin: 0,
                              fontSize: "20px",
                              fontWeight: 700,
                            }}
                        >
                          Generated Captions
                        </h3>
                        <span
                            style={{
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              border: "1px solid #bfdbfe",
                              borderRadius: "999px",
                              padding: "6px 12px",
                              fontSize: "13px",
                              fontWeight: 700,
                            }}
                        >
                    {generatedCaptions.length} results
                  </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {generatedCaptions.map((item, index) => (
                            <div
                                key={item.id ?? index}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "14px",
                                  padding: "16px",
                                  background: "#f9fafb",
                                }}
                            >
                              <p
                                  style={{
                                    margin: 0,
                                    lineHeight: 1.7,
                                    fontSize: "16px",
                                  }}
                              >
                                {renderGeneratedCaptionText(item)}
                              </p>
                            </div>
                        ))}
                      </div>
                    </div>
                )}
              </section>
          )}

          <section>
            <div style={{ marginBottom: "16px" }}>
              <h2
                  style={{
                    margin: 0,
                    fontSize: "24px",
                    fontWeight: 700,
                  }}
              >
                Existing Captions
              </h2>
              <p
                  style={{
                    margin: "8px 0 0 0",
                    color: "#6b7280",
                    lineHeight: 1.6,
                  }}
              >
                Browse captions already stored in the database and vote on them.
              </p>
            </div>

            {loading ? (
                <div
                    style={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "18px",
                      padding: "24px",
                    }}
                >
                  <p style={{ margin: 0 }}>Loading...</p>
                </div>
            ) : !user ? (
                <div
                    style={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "18px",
                      padding: "24px",
                    }}
                >
                  <p style={{ margin: 0 }}>This content is gated. Log in to continue.</p>
                </div>
            ) : data.length === 0 ? (
                <div
                    style={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "18px",
                      padding: "24px",
                    }}
                >
                  <p style={{ margin: 0 }}>No captions found.</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {data.map((item) => (
                      <div
                          key={item.id}
                          style={{
                            background: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "18px",
                            padding: "20px",
                            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
                          }}
                      >
                        <div
                            style={{
                              display: "inline-block",
                              marginBottom: "12px",
                              padding: "6px 10px",
                              borderRadius: "999px",
                              background: "#f3f4f6",
                              color: "#374151",
                              fontSize: "12px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                        >
                          Caption
                        </div>

                        <p
                            style={{
                              margin: "0 0 18px 0",
                              fontSize: "18px",
                              lineHeight: "1.7",
                              color: "#111827",
                            }}
                        >
                          {item.content}
                        </p>

                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                          <button
                              onClick={() => handleVote(item.id, 1)}
                              disabled={submittingVoteId === item.id}
                              style={{
                                padding: "12px 16px",
                                borderRadius: "12px",
                                border: "1px solid #d1d5db",
                                background: "white",
                                cursor: "pointer",
                                fontSize: "15px",
                                fontWeight: 600,
                              }}
                          >
                            👍 Upvote
                          </button>

                          <button
                              onClick={() => handleVote(item.id, -1)}
                              disabled={submittingVoteId === item.id}
                              style={{
                                padding: "12px 16px",
                                borderRadius: "12px",
                                border: "1px solid #d1d5db",
                                background: "white",
                                cursor: "pointer",
                                fontSize: "15px",
                                fontWeight: 600,
                              }}
                          >
                            👎 Downvote
                          </button>
                        </div>
                      </div>
                  ))}
                </div>
            )}
          </section>
        </div>
      </main>
  )
}