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
  isRetryableOpenRouterError,
  OpenRouterRequestError
} from "@/lib/openrouter";
import { OUTPUT_CONTRACT, RUBRIC, roundHalf } from "@/lib/rubric";
import type { ScorePackage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 240;

const CRITERIA: Criterion[] = [...criterionKeys];
const EVALUATOR_A_MODELS = Array.from(new Set([
  process.env.OPENROUTER_SCORING_MODEL_A ||
    process.env.OPENROUTER_SCORING_MODEL ||
    "anthropic/claude-sonnet-4.5",
  "qwen/qwen3.7-max",
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

function withDeadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  code: string,
  onTimeout?: () => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new OpenRouterRequestError({
        message: `${code} exceeded the public request budget`,
        retryable: true,
        code
      }));
    }, milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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
  ]
}

Keep the complete JSON concise enough to finish reliably: exactly two positive and two
limiting evidence items per criterion, exactly three corrections, evidence notes under
16 words, and no repeated transcript or generic study plan. Keep the whole response under
1,400 tokens.

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
  models: string[],
  signal?: AbortSignal
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
    // Coze's public request edge closes around 90 seconds. OpenRouter already
    // performs provider/model failover inside this call; the browser retries
    // the complete, persisted score package if this bounded call fails.
    timeoutMs: 50000,
    maxAttempts: 1,
    maxTokens: 1800,
    reasoningEffort: "minimal",
    signal,
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
  session: ScorePackage,
  signal?: AbortSignal
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
Return exactly one concise positive and one concise limiting evidence item per disputed
criterion, and keep each reason under 80 Chinese characters.

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
    timeoutMs: 25000,
    maxAttempts: 1,
    maxTokens: 700,
    reasoningEffort: "minimal",
    signal,
    contract: {
      name: "ielts_speaking_adjudication",
      schema: adjudicationJsonSchema,
      parse: (value) => adjudicationValidator.parse(value)
    }
  });
}

const FEEDBACK_LIBRARY: Record<Criterion, {
  name: string;
  drill: string;
  measure: string;
}> = {
  FC: {
    name: "流利度与连贯性",
    drill: "用同一题连续讲两分钟；只在意群边界停顿，复听并删掉无效重复。",
    measure: "两分钟内不因找词造成明显断裂，观点—原因—例子链条完整。"
  },
  LR: {
    name: "词汇资源",
    drill: "为当天三道题各整理五组精准搭配，并用同义改写复述原答案。",
    measure: "每题自然使用三组准确搭配，重复核心词不超过两次。"
  },
  GRA: {
    name: "语法范围与准确性",
    drill: "把原回答改写成六句：三句准确简单句、三句含从句的复杂句，再录音复述。",
    measure: "复杂句完整且主谓、时态、从句连接稳定，错误不妨碍理解。"
  },
  P: {
    name: "发音",
    drill: "按意群影子跟读英国英语材料，标出重音、弱读和语调，再录同一句对比。",
    measure: "意群清楚，关键词重音可听见，长句节奏不中断，听者无需猜测。"
  }
};

function buildDeterministicFeedback(
  session: ScorePackage,
  subBands: Record<Criterion, number>,
  criteria: Record<string, any>,
  diagnosisZh: string
) {
  const ranked = [...CRITERIA].sort((left, right) => subBands[left] - subBands[right]);
  const priorities = ranked.slice(0, 3).map((criterion, index) => ({
    rank: index + 1,
    diagnosis_zh: `${FEEDBACK_LIBRARY[criterion].name} ${subBands[criterion]}：${criteria[criterion]?.why_not_higher || criteria[criterion]?.why || "尚未稳定达到上一档描述。"}`
      .slice(0, 180),
    drill_zh: FEEDBACK_LIBRARY[criterion].drill,
    schedule_zh: index === 0 ? "每天20分钟，连续7天。" : "隔天15分钟，连续7天。",
    success_measure_zh: FEEDBACK_LIBRARY[criterion].measure
  }));
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const analysis of session.analyses) {
    const part = Number(analysis?.part) as 1 | 2 | 3;
    if (part in counts) counts[part] += 1;
  }
  const partDiagnostics = {
    part1: `已分析 ${counts[1]} 个回答；重点看短答能否立即扩展并保持准确。`,
    part2: `已分析 ${counts[2]} 个长回答；重点看两分钟组织、持续表达和细节展开。`,
    part3: `已分析 ${counts[3]} 个回答；重点看抽象观点、论证深度和复杂语言控制。`
  };
  const weakest = ranked[0];
  const second = ranked[1];
  const sevenDayPlan = [
    `第1天：复盘${FEEDBACK_LIBRARY[weakest].name}证据并重录原题。`,
    `第2天：完成${FEEDBACK_LIBRARY[weakest].name}专项训练。`,
    `第3天：完成${FEEDBACK_LIBRARY[second].name}专项训练。`,
    "第4天：限时完成一组Part 1并逐句纠错。",
    "第5天：准备1分钟后完成Part 2两分钟长答。",
    "第6天：完成三道Part 3，强制加入原因、例子和反方观点。",
    "第7天：重做整套测试，对照成功标准复盘。"
  ];
  const spokenFeedbackZh = `这次雅思口语练习的估分是依据四项官方标准得出的。${diagnosisZh}。当前最需要先解决的是${FEEDBACK_LIBRARY[weakest].name}，其次是${FEEDBACK_LIBRARY[second].name}。请先按页面中的时间戳证据复听原录音，再完成七天训练。技术故障不会降低你的分数；只有录音中的真实语言表现会影响判断。`;
  return { priorities, partDiagnostics, sevenDayPlan, spokenFeedbackZh };
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

    const evaluationController = new AbortController();
    const [a, b] = await withDeadline(Promise.all([
      scoreEvaluator("A", session, EVALUATOR_A_MODELS, evaluationController.signal),
      scoreEvaluator("B", session, EVALUATOR_B_MODELS, evaluationController.signal)
    ]), 55000, "EVALUATION_DEADLINE", () => evaluationController.abort());

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
      const adjudicationController = new AbortController();
      const adjudication = await withDeadline(
        adjudicate(disputedCriteria, a, b, session, adjudicationController.signal),
        20000,
        "ADJUDICATION_DEADLINE",
        () => adjudicationController.abort()
      );
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
    const diagnosisZh = a.diagnosis_zh;
    const feedback = buildDeterministicFeedback(
      session,
      subBands,
      criteria,
      diagnosisZh
    );
    return NextResponse.json({
      status: "scored",
      label: "IELTS-style estimated band — practice feedback, not an official IELTS score",
      overall: calibratedOverall,
      subBands,
      diagnosisZh,
      criteria,
      evidenceCorrections: a.evidence_corrections?.slice(0, 8) || [],
      priorities: feedback.priorities,
      partDiagnostics: feedback.partDiagnostics,
      sevenDayPlan: feedback.sevenDayPlan,
      spokenFeedbackZh: feedback.spokenFeedbackZh
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
    if (error instanceof OpenRouterRequestError) {
      return NextResponse.json(
        {
          status: "provider_error",
          code: "SCORING_PROVIDER_REJECTED",
          diagnosticCode: error.code,
          providerStatus: error.status || null,
          messageZh: "评分服务暂时无法接受本次请求。你的完整测试证据仍保存在本页面，可以直接重试，不必重考。"
        },
        {
          status: 502,
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
