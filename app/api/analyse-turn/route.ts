import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  turnAnalysisJsonSchema,
  turnAnalysisValidator
} from "@/lib/scoring-contracts";
import {
  chatJson,
  isRetryableOpenRouterError
} from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 180;

const metadataValidator = z.object({
  sessionId: z.string().min(1).optional(),
  turnId: z.string().min(1),
  part: z.number().int().min(1).max(3),
  prompt: z.string(),
  durationSeconds: z.number().positive()
}).strict();

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const metadataText = form.get("metadata");
    if (!(audio instanceof File) || typeof metadataText !== "string") {
      return NextResponse.json({ error: "audio and metadata are required" }, { status: 400 });
    }
    if (audio.size < 1000) {
      return NextResponse.json(
        {
          status: "unrateable_audio",
          code: "UNRATEABLE_AUDIO",
          message: "The recording contained too little audio to analyse."
        },
        { status: 422 }
      );
    }
    const metadata = metadataValidator.parse(JSON.parse(metadataText));
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
    const models = Array.from(new Set([
      primaryModel,
      "mistralai/voxtral-small-24b-2507"
    ]));
    const result = await chatJson(messages, {
      models,
      operation: "analyse_turn",
      sessionId: metadata.sessionId,
      // Keep one public request below the hosting edge timeout. The client
      // retains the raw Blob and retries this route without losing the turn.
      timeoutMs: 42000,
      maxAttempts: 1,
      maxTokens: 5000,
      requireParameters: false,
      contract: {
        name: "ielts_turn_analysis",
        schema: turnAnalysisJsonSchema,
        parse: (value) => turnAnalysisValidator.parse(value)
      }
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("analyse-turn", error);
    if (isRetryableOpenRouterError(error)) {
      return NextResponse.json(
        {
          status: "retryable_error",
          code: "ANALYSIS_TEMPORARILY_UNAVAILABLE",
          retryAfterSeconds: error.retryAfterSeconds || 3,
          message: "This answer is safely held in the current session and can be retried."
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "audio and metadata are invalid" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "This answer could not be analysed. The recording remains only in this session." },
      { status: 500 }
    );
  }
}
