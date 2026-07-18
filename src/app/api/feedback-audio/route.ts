import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Coze TTS integration (does not require OPENROUTER_API_KEY)
const COZE_TTS_BASE_URL = process.env.COZE_INTEGRATION_BASE_URL || "https://integration.coze.cn";
const COZE_TTS_TOKEN = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || "";

async function cozeTTS(text: string): Promise<{ audioUri: string; audioSize: number }> {
  const res = await fetch(`${COZE_TTS_BASE_URL}/api/v3/tts/unidirectional`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COZE_TTS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user: { uid: "ielts-mock-examiner" },
      req_params: {
        speaker: "zh_female_xiaohe_uranus_bigtts",
        text,
        audio_params: {
          format: "mp3",
          sample_rate: 24000,
          speech_rate: 0,
          loudness_rate: 0
        }
      }
    })
  });

  if (!res.ok || !res.body) {
    throw new Error(`TTS HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let audioUri = "";
  let audioSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim());
        const data = payload?.data;
        if (data?.audio) {
          audioUri = data.audio;
          audioSize = data.audio_size ?? 0;
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }

  if (!audioUri) throw new Error("TTS stream missing audio URI");
  return { audioUri, audioSize };
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (typeof text !== "string" || text.length < 20 || text.length > 1800) {
      return NextResponse.json({ error: "invalid feedback text" }, { status: 400 });
    }
    const result = await cozeTTS(text);
    return NextResponse.json(result);
  } catch (error) {
    console.error("feedback-audio", error);
    return NextResponse.json({ error: "spoken feedback is temporarily unavailable" }, { status: 502 });
  }
}
