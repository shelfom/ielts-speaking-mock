import { NextRequest, NextResponse } from "next/server";
import { chatJson, asrTranscribe } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const metadataText = form.get("metadata");
    if (!(audio instanceof File) || typeof metadataText !== "string") {
      return NextResponse.json({ error: "audio and metadata are required" }, { status: 400 });
    }
    const metadata = JSON.parse(metadataText);
    const audioBuffer = Buffer.from(await audio.arrayBuffer());

    // Step 1: Transcribe audio using Coze ASR
    const transcript = await asrTranscribe(audioBuffer, "audio/wav");

    if (!transcript || transcript.trim().length < 2) {
      return NextResponse.json({
        turnId: metadata.turnId,
        part: metadata.part,
        prompt: metadata.prompt,
        durationSeconds: Number(metadata.durationSeconds),
        transcript: "",
        segments: [],
        audioEvidence: [],
        quality: "insufficient",
        error: "No speech detected in this recording."
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // Step 2: Analyse transcript using LLM
    const prompt = `
Analyse this single candidate answer from an IELTS-style speaking mock test.
Part ${metadata.part}. Examiner prompt: ${metadata.prompt}
Turn ID: ${metadata.turnId}. Recorded duration: ${metadata.durationSeconds} seconds.

Transcript: "${transcript}"

Return JSON only:
{
  "turnId":"${metadata.turnId}",
  "part":${metadata.part},
  "prompt":${JSON.stringify(metadata.prompt)},
  "durationSeconds":${Number(metadata.durationSeconds)},
  "transcript":${JSON.stringify(transcript)},
  "segments":[{"start":0.0,"end":${Number(metadata.durationSeconds)},"text":${JSON.stringify(transcript)}}],
  "audioEvidence":[
    {"start":0.0,"end":2.0,"audio_feature":"chunking|rhythm|stress|intonation|connected_speech|word_stress|phoneme|intelligibility","note":"specific observation based on transcript analysis"}
  ],
  "quality":"good|limited|insufficient"
}
Use times relative to this turn. Include at least four observations when
quality permits, balancing strengths and limitations. Base observations on transcript
quality, fluency markers, lexical range, and grammatical complexity. Do not assign an IELTS band yet.
`.trim();

    const result = await chatJson([
      { role: "user", content: prompt }
    ]);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("analyse-turn", error);
    return NextResponse.json(
      { error: "This answer could not be analysed. The recording remains only in this session." },
      { status: 502 }
    );
  }
}
