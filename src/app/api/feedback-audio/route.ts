import { NextRequest, NextResponse } from "next/server";
import { createSpeech } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (typeof text !== "string" || text.length < 20 || text.length > 1800) {
      return NextResponse.json({ error: "invalid feedback text" }, { status: 400 });
    }
    const { audioUri, audioSize } = await createSpeech(text);
    return NextResponse.json({ audioUri, audioSize }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("feedback-audio", error);
    return NextResponse.json({ error: "spoken feedback is temporarily unavailable" }, { status: 502 });
  }
}
