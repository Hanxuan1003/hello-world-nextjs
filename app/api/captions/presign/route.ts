import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
    try {
        const { contentType } = await req.json()

        if (!contentType) {
            return NextResponse.json(
                { error: "Missing contentType" },
                { status: 400 }
            )
        }

        const supabase = await createClient()

        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError || !session?.access_token) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            )
        }

        const response = await fetch(
            "https://api.almostcrackd.ai/pipeline/generate-presigned-url",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contentType,
                }),
            }
        )

        const data = await response.json()

        if (!response.ok) {
            return NextResponse.json(
                { error: data?.error ?? "Failed to generate presigned URL" },
                { status: response.status }
            )
        }

        return NextResponse.json(data)
    } catch (error) {
        console.error("Presign route error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}