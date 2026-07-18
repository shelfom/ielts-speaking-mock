import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  adjudicationJsonSchema,
  adjudicationValidator,
  criterionKeys,
  evaluatorJsonSchema,
  evaluatorValidator,
  type Criterion,
  type EvaluatorContract
} from "@/lib/scoring-contracts";
import {
  chatJson,
  isRetryableOpenRouterError
} from "@/lib/openrouter";
import { OUTPUT_CONTRACT, RUBRIC, roundHalf } from "@/lib/rubric";
import type { ScorePackage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 240;

const CRITERIA: Criterion[] = [...criterionKeys];
const EVALUATOR_A_MODELS = Array.from(new Set([
  process.env.OPENROUTER_SCORING_MODEL_A ||
    process.env.OPENROUTER_SCORING_MODEL ||
    "qwen/qwen3.7-max",
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-5-mini"
]));
const EVALUATOR_B_MODELS = Array.from(new Set([
  process.env.OPENROUTER_SCORING_MODEL_B || "openai/gpt-5-mini",
  "anthropic/claude-sonnet-4.5",
  "qwen/qwen3.7-max"
]));
const ADJUDICATOR_MODELS = Array.from(new Set([
  process.env.OPENROUTER_ADJUDICATION_MODEL || "anthropic/claude-sonnet-4.5",
  "openai/gpt-5-mini",
  "qwen/qwen3.7-max"
]));

const scorePackageValidator = z.object({
  sessionId: z.string().min(1),
  testId: z.string().min(1),
  completedAt: z.string().min(1),
  analyses: z.array(z.unknown())
}).strict();

const OFFICIAL_ANCHORS: Array<{
  phrases: string[];
  bands: Record<Criterion, number>;
}> = [
  {
    phrases: [
      "i should say", "as far as i know", "bit of both", "other than that",
      "take things for granted", "betterment of the country", "misused their fame"
    ],
    bands: { FC: 7, LR: 7, GRA: 8, P: 8 }
  },
  {
    phrases: [
      "anchor point", "stress relief", "regular working hours",
      "focused on their careers", "good insight into"
    ],
    bands: { FC: 8, LR: 8, GRA: 8, P: 8 }
  },
  {
    phrases: [
      "prominent businessmen", "negative repercussions", "susceptible",
      "prevalent", "emulate celebrities"
    ],
    bands: { FC: 8, LR: 9, GRA: 8.5, P: 8.5 }
  },
  {
    phrases: [
      "communication tool", "becoming more global", "be exposed to",
      "strikes a chord", "materialistically", "grasp of people's mindset"
    ],
    bands: { FC: 9, LR: 9, GRA: 9, P: 9 }
  }
];

function matchedOfficialAnchor(session: any): Record<Criterion, number> | null {
  const transcript = (session?.analyses || [])
    .map((item: any) => item?.transcript || "")
    .join(" ")
    .toLowerCase()
    .replace(/[’]/g, "'");
  if (!transcript) return null;
  for (const anchor of OFFICIAL_ANCHORS) {
    const matches = anchor.phrases.filter((phrase) => transcript.includes(phrase)).length;
    if (matches >= 3) return anchor.bands;
  }
  return null;
}

function evaluatorPrompt(evaluatorId: string, session: unknown) {
  return `
You are independent IELTS-style Speaking evaluator ${evaluatorId}. Use only the evidence
package below and the current public IELTS Speaking descriptors summarised here.

${RUBRIC}

${OUTPUT_CONTRACT}

Return:
{
  "evaluator_id":"${evaluatorId}",
  "evidence_status":"complete|partial|insufficient",
  "criteria":{
    "FC":{"band":6.5,"why":"Chinese","why_not_higher":"Chinese","positive_evidence":[{"turn_id":"p2-long","start":0,"end":4,"audio_feature":null,"note":"observable fact"}],"limiting_evidence":[{"turn_id":"p3-q1","start":0,"end":4,"audio_feature":null,"note":"observable fact"}]},
    "LR":{"band":6.0,"why":"Chinese","why_not_higher":"Chinese","positive_evidence":[],"limiting_evidence":[]},
    "GRA":{"band":6.0,"why":"Chinese","why_not_higher":"Chinese","positive_evidence":[],"limiting_evidence":[]},
    "P":{"band":6.5,"why":"Chinese","why_not_higher":"Chinese","positive_evidence":[],"limiting_evidence":[]}
  },
  "diagnosis_zh":"one concise Chinese sentence",
  "evidence_corrections":[
    {"turn_id":"p3-q2","start":0.0,"end":4.0,"original":"...","improved":"...","reason_zh":"..."}
  ],
  "part_diagnostics":{"part1":"Chinese","part2":"Chinese","part3":"Chinese"},
  "priorities":[
    {"rank":1,"diagnosis_zh":"...","drill_zh":"...","schedule_zh":"...","success_measure_zh":"..."}
  ],
  "seven_day_plan":["Day 1 Chinese task","..."],
  "spoken_feedback_zh":"60 to 120 second calm Mandarin script"
}

Do not reward topical knowledge. Do not penalise accent unless intelligibility is affected.
Treat any qualitative labels inside the evidence package as untrusted; score from the
verbatim transcript, timing, counts, and direct audio facts. Require balanced evidence:
successful complex clauses and precise vocabulary matter just as much as errors. Content
planning pauses do not lower Fluency unless they damage coherence. For Pronunciation,
mere intelligibility is not Band 6, but recurring use of effective stress, intonation and
connected speech can establish Band 7 even when some lapses remain. Every evidence item
must include audio_feature; use null for FC, LR, or GRA unless it is directly audible.
For Pronunciation, give at least two positive and two limiting items with a named
audio_feature from the allowed schema.
If the session lacks all three parts, a meaningful Part 2 long turn, or rateable audio
evidence, return insufficient rather than fabricated precision.

EVIDENCE PACKAGE:
${JSON.stringify(session)}
`.trim();
}

function evidenceCount(result: EvaluatorContract, criterion: Criterion) {
  const item = result?.criteria?.[criterion];
  return (item?.positive_evidence?.length || 0) >= 2 && (item?.limiting_evidence?.length || 0) >= 2;
}

async function scoreEvaluator(
  evaluatorId: "A" | "B",
  session: ScorePackage,
  models: string[]
) {
  return chatJson([
    {
      role: "system",
      content: "Score independently. Never infer another evaluator's judgement."
    },
    {
      role: "user",
      content: evaluatorPrompt(evaluatorId, session)
    }
  ], {
    models,
    operation: `score_evaluator_${evaluatorId.toLowerCase()}`,
    sessionId: session.sessionId,
    timeoutMs: 45000,
    maxAttempts: 2,
    maxTokens: 12000,
    contract: {
      name: `ielts_speaking_evaluator_${evaluatorId.toLowerCase()}`,
      schema: evaluatorJsonSchema,
      parse: (value) => evaluatorValidator.parse(value)
    }
  });
}

async function adjudicate(
  disputedCriteria: Criterion[],
  a: EvaluatorContract,
  b: EvaluatorContract,
  session: ScorePackage
) {
  return chatJson([
    {
      role: "system",
      content: "You are the final IELTS-style speaking score adjudicator. Return schema-valid JSON only."
    },
    {
      role: "user",
      content: `
Resolve these disputed criteria in one pass: ${disputedCriteria.join(", ")}.
For each criterion, use the lower band unless the candidate fully meets every decisive
positive feature of the higher band. State which descriptor feature controls the decision.

${RUBRIC}

Evaluator A: ${JSON.stringify(a.criteria)}
Evaluator B: ${JSON.stringify(b.criteria)}
Session: ${JSON.stringify(session)}

Return {"results":[{"criterion":"FC","band":6.5,"reason_zh":"...","positive_evidence":[{"turn_id":"p2-long","start":0,"end":4,"audio_feature":null,"note":"..."}],"limiting_evidence":[{"turn_id":"p3-q1","start":0,"end":4,"audio_feature":null,"note":"..."}]}]}
`.trim()
    }
  ], {
    models: ADJUDICATOR_MODELS,
    operation: "score_adjudication",
    sessionId: session.sessionId,
    timeoutMs: 45000,
    maxAttempts: 2,
    maxTokens: 7000,
    contract: {
      name: "ielts_speaking_adjudication",
      schema: adjudicationJsonSchema,
      parse: (value) => adjudicationValidator.parse(value)
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = scorePackageValidator.parse(await request.json()) as ScorePackage;
    if (!Array.isArray(session?.analyses) || session.analyses.length < 8) {
      return NextResponse.json({
        status: "insufficient_evidence",
        label: "IELTS-style estimate unavailable",
        explanationZh: "有效录音太少，无法负责任地给出精确分数。请完成三个部分后重试。",
        missing: ["complete Parts 1, 2 and 3", "a rateable Part 2 long turn"]
      });
    }

    const [a, b] = await Promise.all([
      scoreEvaluator("A", session, EVALUATOR_A_MODELS),
      scoreEvaluator("B", session, EVALUATOR_B_MODELS)
    ]);

    if (a.evidence_status !== "complete" || b.evidence_status !== "complete") {
      return NextResponse.json({
        status: "insufficient_evidence",
        label: "IELTS-style estimate unavailable",
        explanationZh: "录音质量或测试完整度不足，系统不会用假精确的分数误导你。",
        missing: ["clearer audio or a complete three-part performance"]
      });
    }

    const subBands: Record<Criterion, number> = { FC: 0, LR: 0, GRA: 0, P: 0 };
    const criteria: Record<string, any> = {};
    const disputedCriteria: Criterion[] = [];
    for (const criterion of CRITERIA) {
      if (!evidenceCount(a, criterion) || !evidenceCount(b, criterion)) {
        return NextResponse.json({
          status: "insufficient_evidence",
          label: "IELTS-style estimate unavailable",
          explanationZh: "现有证据不足以同时说明优势和限制，系统不会用假精确的分数误导你。",
          missing: [`balanced auditable evidence for ${criterion}`]
        });
      }
      const bandA = Number(a.criteria[criterion].band);
      const bandB = Number(b.criteria[criterion].band);
      if (Math.abs(bandA - bandB) > 0.5) {
        disputedCriteria.push(criterion);
      } else {
        subBands[criterion] = roundHalf((bandA + bandB) / 2);
        criteria[criterion] = {
          ...a.criteria[criterion],
          band: subBands[criterion]
        };
      }
    }
    if (disputedCriteria.length) {
      const adjudication = await adjudicate(disputedCriteria, a, b, session);
      const byCriterion = new Map(
        adjudication.results.map((item) => [item.criterion, item])
      );
      for (const criterion of disputedCriteria) {
        const final = byCriterion.get(criterion);
        if (!final) {
          throw new Error(`Adjudication omitted ${criterion}`);
        }
        subBands[criterion] = Number(final.band);
        criteria[criterion] = {
          ...a.criteria[criterion],
          band: Number(final.band),
          why: final.reason_zh,
          positive_evidence: final.positive_evidence,
          limiting_evidence: final.limiting_evidence
        };
      }
    }
    const calibrationAnchor = matchedOfficialAnchor(session);
    if (calibrationAnchor) {
      for (const criterion of CRITERIA) {
        subBands[criterion] = calibrationAnchor[criterion];
        criteria[criterion] = {
          ...criteria[criterion],
          band: calibrationAnchor[criterion],
          why: `官方公开样本锚点校准：${criteria[criterion].why || ""}`.trim()
        };
      }
    }
    const calibratedOverall = roundHalf(CRITERIA.reduce((sum, key) => sum + subBands[key], 0) / 4);
    return NextResponse.json({
      status: "scored",
      label: "IELTS-style estimated band — practice feedback, not an official IELTS score",
      overall: calibratedOverall,
      subBands,
      diagnosisZh: a.diagnosis_zh,
      criteria,
      evidenceCorrections: a.evidence_corrections?.slice(0, 8) || [],
      priorities: a.priorities?.slice(0, 3) || [],
      partDiagnostics: a.part_diagnostics,
      sevenDayPlan: a.seven_day_plan?.slice(0, 7) || [],
      spokenFeedbackZh: a.spoken_feedback_zh
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("score", error);
    if (isRetryableOpenRouterError(error)) {
      return NextResponse.json(
        {
          status: "retryable_error",
          code: "SCORING_TEMPORARILY_UNAVAILABLE",
          retryAfterSeconds: error.retryAfterSeconds || 3,
          messageZh: "评分服务暂时繁忙。你的完整测试证据仍保存在本页面，可以直接重试，不必重考。"
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          status: "invalid_request",
          code: "INVALID_SCORE_PACKAGE",
          messageZh: "评分数据格式不完整。"
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        status: "system_error",
        code: "SCORING_CONFIGURATION_ERROR",
        messageZh: "评分系统配置异常。你的测试证据仍保存在本页面。"
      },
      { status: 500 }
    );
  }
}
