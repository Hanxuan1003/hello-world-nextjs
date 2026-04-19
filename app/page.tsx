"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type BugReport = {
  id: number
  subject: string
  message: string
  created_datetime_utc: string
}

export default function Home() {
  const [supabase] = useState(() => createClient())

  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadUserAndData() {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      setUser(user)

      if (user) {
        const { data, error } = await supabase
            .from("bug_reports")
            .select("id, subject, message, created_datetime_utc")

        if (error) {
          console.error(error)
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
    async function loadBugReports() {
      if (!user) {
        setData([])
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
          .from("bug_reports")
          .select("id, subject, message, created_datetime_utc")

      if (error) {
        console.error(error)
        setData([])
      } else {
        setData(data || [])
      }

      setLoading(false)
    }

    loadBugReports()
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

  return (
      <main style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
        <h1 style={{ marginBottom: "20px" }}>Bug Reports</h1>

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
                  Please log in with Google to view the bug reports.
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
            <p>No data found.</p>
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
                    <h2 style={{ margin: "0 0 8px 0" }}>
                      #{item.id} - {item.subject}
                    </h2>
                    <p style={{ margin: "0 0 8px 0" }}>{item.message}</p>
                    <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
                      Created: {item.created_datetime_utc}
                    </p>
                  </div>
              ))}
            </div>
        )}
      </main>
  )
}