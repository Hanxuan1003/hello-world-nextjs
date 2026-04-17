"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

type BugReport = {
  id: number
  subject: string
  message: string
  created_datetime_utc: string
}

export default function Home() {
  const [data, setData] = useState<BugReport[]>([])

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
          .from("bug_reports")
          .select("id, subject, message, created_datetime_utc")

      if (error) {
        console.error(error)
      } else {
        setData(data || [])
      }
    }

    fetchData()
  }, [])

  return (
      <main style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
        <h1 style={{ marginBottom: "20px" }}>Bug Reports</h1>

        {data.length === 0 ? (
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