import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
    try {
        const { imageUrl } = await req.json()

        if (!imageUrl) {
            return NextResponse.json(
                { error: "Missing imageUrl" },
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

        const registerResponse = await fetch(
            "https://api.almostcrackd.ai/pipeline/upload-image-from-url",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    imageUrl,
                    isCommonUse: false,
                }),
            }
        )

        const registerData = await registerResponse.json()

        if (!registerResponse.ok) {
            return NextResponse.json(
                { error: registerData?.error ?? "Failed to register image URL" },
                { status: registerResponse.status }
            )
        }

        const imageId = registerData?.imageId

        if (!imageId) {
            return NextResponse.json(
                { error: "No imageId returned from upload-image-from-url" },
                { status: 500 }
            )
        }

        const captionsResponse = await fetch(
            "https://api.almostcrackd.ai/pipeline/generate-captions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    imageId,
                }),
            }
        )

        const captionsData = await captionsResponse.json()

        if (!captionsResponse.ok) {
            return NextResponse.json(
                { error: captionsData?.error ?? "Failed to generate captions" },
                { status: captionsResponse.status }
            )
        }

        return NextResponse.json({
            imageId,
            captions: captionsData,
        })
    } catch (error) {
        console.error("Generate route error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}