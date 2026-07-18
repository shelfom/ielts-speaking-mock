import { NextRequest, NextResponse } from "next/server";
import { chatJson } from "@/lib/openrouter";

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
    const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const prompt = `
Analyse this single candidate answer from an IELTS-style speaking mock test.
Part ${metadata.part}. Examiner prompt: ${metadata.prompt}
Turn ID: ${metadata.turnId}. Recorded duration: ${metadata.durationSeconds} seconds.

Return JSON only:
{
  "turnId":"${metadata.turnId}",
  "part":${metadata.part},
  "prompt":${JSON.stringify(metadata.prompt)},
  "durationSeconds":${Number(metadata.durationSeconds)},
  "transcript":"verbatim English transcript",
  "segments":[{"start":0.0,"end":1.2,"text":"..."}],
  "audioEvidence":[
    {"start":0.0,"end":2.0,"polarity":"strength|limitation","audio_feature":"chunking|rhythm|stress|intonation|connected_speech|word_stress|phoneme|intelligibility","note":"specific observable fact"}
  ],
  "performanceCounts":{
    "approximateWords":0,
    "falseStartOrRepairClusters":0,
    "clearCoherenceLosses":0,
    "successfulComplexSentences":0,
    "flawedComplexAttempts":0,
    "notableLessCommonOrIdiomaticItems":0
  },
  "quality":"good|limited|insufficient"
}
Use times relative to this turn. Include at least four direct-audio observations when
quality permits, balancing strengths and limitations. Describe only observable facts;
never use band-like conclusions such as basic, adequate, limited, good, wide, or fluent.
Distinguish a pause used to plan an idea from a pause used to search for language. Report
successful higher-level language as carefully as errors. A long string joined by "and" is
not a successful complex sentence. Do not assign an IELTS band yet.
`.trim();
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "input_audio", input_audio: { data: base64, format: "wav" } }
        ]
      }
    ];
    const primaryModel = process.env.OPENROUTER_AUDIO_MODEL || "thinkingmachines/inkling";
    let result;
    try {
      result = await chatJson(messages, primaryModel);
    } catch (primaryError) {
      if (primaryModel === "mistralai/voxtral-small-24b-2507") throw primaryError;
      result = await chatJson(messages, "mistralai/voxtral-small-24b-2507");
    }
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
