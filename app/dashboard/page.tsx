import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function Dashboard() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/")
    }

    return (
        <main style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
            <h1>Protected Dashboard</h1>
            <p>Welcome, {user.email}</p>
            <p>This page is only visible to logged-in users.</p>
        </main>
    )
}