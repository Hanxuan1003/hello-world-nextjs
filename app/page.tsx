"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Caption = {
  id: string
  content: string
}

export default function Home() {
  const [supabase] = useState(() => createClient())

  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<Caption[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)

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

  return (
      <main style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
        <h1 style={{ marginBottom: "20px" }}>Captions</h1>

        <div style={{ marginBottom: "20px" }}>
          {user ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ margin: 0 }}>
                  Logged in as: <strong>{user.email}</strong>
                </p>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <button
                      onClick={handleLogout}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: "pointer",
                      }}
                  >
                    Logout
                  </button>

                  <a
                      href="/dashboard"
                      style={{
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        textDecoration: "none",
                        color: "black",
                        display: "inline-block",
                      }}
                  >
                    Go to Dashboard
                  </a>
                </div>
              </div>
          ) : (
              <div
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "20px",
                    backgroundColor: "#fafafa",
                  }}
              >
                <p style={{ marginTop: 0 }}>
                  Please log in with Google to view and rate captions.
                </p>
                <button
                    onClick={handleLogin}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                    }}
                >
                  Login with Google
                </button>
              </div>
          )}
        </div>

        {loading ? (
            <p>Loading...</p>
        ) : !user ? (
            <p>This content is gated. Log in to continue.</p>
        ) : data.length === 0 ? (
            <p>No captions found.</p>
        ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {data.map((item) => (
                  <div
                      key={item.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: "10px",
                        padding: "16px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                      }}
                  >
                    <h2 style={{ margin: "0 0 8px 0" }}>Caption</h2>

                    <p style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "1.5" }}>
                      {item.content}
                    </p>

                    <div style={{ display: "flex", gap: "12px" }}>
                      <button
                          onClick={() => handleVote(item.id, 1)}
                          disabled={submittingVoteId === item.id}
                          style={{
                            padding: "10px 16px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: "pointer",
                          }}
                      >
                        👍 Upvote
                      </button>

                      <button
                          onClick={() => handleVote(item.id, -1)}
                          disabled={submittingVoteId === item.id}
                          style={{
                            padding: "10px 16px",
                            borderRadius: "8px",
                            border: "1px solid #ccc",
                            background: "white",
                            cursor: "pointer",
                          }}
                      >
                        👎 Downvote
                      </button>
                    </div>
                  </div>
              ))}
            </div>
        )}
      </main>
  )
}