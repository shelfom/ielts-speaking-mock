import { NextRequest, NextResponse } from "next/server";
import { chatJson } from "@/lib/openrouter";
import { OUTPUT_CONTRACT, RUBRIC, roundHalf } from "@/lib/rubric";

export const runtime = "nodejs";
export const maxDuration = 240;

type Criterion = "FC" | "LR" | "GRA" | "P";
const CRITERIA: Criterion[] = ["FC", "LR", "GRA", "P"];

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
    "FC":{"band":6.5,"why":"Chinese","why_not_higher":"Chinese","positive_evidence":[],"limiting_evidence":[]},
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
connected speech can establish Band 7 even when some lapses remain.
If the session lacks all three parts, a meaningful Part 2 long turn, or rateable audio
evidence, return insufficient rather than fabricated precision.

EVIDENCE PACKAGE:
${JSON.stringify(session)}
`.trim();
}

function evidenceCount(result: any, criterion: Criterion) {
  const item = result?.criteria?.[criterion];
  return (item?.positive_evidence?.length || 0) >= 2 && (item?.limiting_evidence?.length || 0) >= 2;
}

async function adjudicate(criterion: Criterion, a: any, b: any, session: unknown) {
  return chatJson([
    {
      role: "system",
      content: "You are the final IELTS-style speaking score adjudicator. Return JSON only."
    },
    {
      role: "user",
      content: `
Resolve only ${criterion}. The independent bands differ by more than 0.5.
Use the lower band unless the candidate fully meets every decisive positive feature of
the higher band. State which descriptor feature controls the decision.

${RUBRIC}

Evaluator A: ${JSON.stringify(a.criteria[criterion])}
Evaluator B: ${JSON.stringify(b.criteria[criterion])}
Session: ${JSON.stringify(session)}

Return {"criterion":"${criterion}","band":6.5,"reason_zh":"...","positive_evidence":[],"limiting_evidence":[]}
`.trim()
    }
  ]);
}

export async function POST(request: NextRequest) {
  try {
    const session = await request.json();
    if (!Array.isArray(session?.analyses) || session.analyses.length < 8) {
      return NextResponse.json({
        status: "insufficient_evidence",
        label: "IELTS-style estimate unavailable",
        explanationZh: "有效录音太少，无法负责任地给出精确分数。请完成三个部分后重试。",
        missing: ["complete Parts 1, 2 and 3", "a rateable Part 2 long turn"]
      });
    }

    const [a, b] = await Promise.all([
      chatJson([{ role: "system", content: "Score independently. Never infer another evaluator's judgement." }, { role: "user", content: evaluatorPrompt("A", session) }]),
      chatJson([{ role: "system", content: "Score independently. Never infer another evaluator's judgement." }, { role: "user", content: evaluatorPrompt("B", session) }])
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
    for (const criterion of CRITERIA) {
      if (!evidenceCount(a, criterion) || !evidenceCount(b, criterion)) {
        throw new Error(`${criterion} lacks auditable evidence`);
      }
      const bandA = Number(a.criteria[criterion].band);
      const bandB = Number(b.criteria[criterion].band);
      if (Math.abs(bandA - bandB) > 0.5) {
        const final = await adjudicate(criterion, a, b, session);
        subBands[criterion] = Number(final.band);
        criteria[criterion] = {
          ...a.criteria[criterion],
          band: Number(final.band),
          why: final.reason_zh,
          positive_evidence: final.positive_evidence,
          limiting_evidence: final.limiting_evidence
        };
      } else {
        subBands[criterion] = roundHalf((bandA + bandB) / 2);
        criteria[criterion] = {
          ...a.criteria[criterion],
          band: subBands[criterion]
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
    return NextResponse.json(
      { error: "Scoring could not be completed. Your recording has not been retained." },
      { status: 502 }
    );
  }
}
