import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
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
    <main className="app-shell">
      <div className="page-frame">
        <section className="workflow-panel">
          <p className="eyebrow">Account status</p>
          <h1>Caption workflow dashboard</h1>
          <p className="account-copy">
            You are signed in as {user.email}. Return to the playground to upload an image, generate
            captions, and vote on saved caption cards.
          </p>
          <div className="generation-actions">
            <Link className="primary-button" href="/">
              Back to Playground
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
