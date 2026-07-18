import { z } from "zod";

export const criterionKeys = ["FC", "LR", "GRA", "P"] as const;
export type Criterion = (typeof criterionKeys)[number];

const segmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string()
}).strict();

const audioEvidenceSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  polarity: z.enum(["strength", "limitation"]),
  audio_feature: z.enum([
    "chunking",
    "rhythm",
    "stress",
    "intonation",
    "connected_speech",
    "word_stress",
    "phoneme",
    "intelligibility"
  ]),
  note: z.string().min(1)
}).strict();

export const turnAnalysisValidator = z.object({
  turnId: z.string().min(1),
  part: z.number().int().min(1).max(3),
  prompt: z.string(),
  durationSeconds: z.number().positive(),
  transcript: z.string(),
  segments: z.array(segmentSchema),
  audioEvidence: z.array(audioEvidenceSchema),
  performanceCounts: z.object({
    approximateWords: z.number().int().nonnegative(),
    falseStartOrRepairClusters: z.number().int().nonnegative(),
    clearCoherenceLosses: z.number().int().nonnegative(),
    successfulComplexSentences: z.number().int().nonnegative(),
    flawedComplexAttempts: z.number().int().nonnegative(),
    notableLessCommonOrIdiomaticItems: z.number().int().nonnegative()
  }).strict(),
  quality: z.enum(["good", "limited", "insufficient"])
}).strict();

const scoreEvidenceValidator = z.object({
  turn_id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  audio_feature: z.enum([
    "chunking",
    "rhythm",
    "stress",
    "intonation",
    "connected_speech",
    "word_stress",
    "phoneme",
    "intelligibility"
  ]).nullable(),
  note: z.string().min(1)
}).strict();

const criterionEvaluationValidator = z.object({
  band: z.number().min(0).max(9).multipleOf(0.5),
  why: z.string().min(1),
  why_not_higher: z.string().min(1),
  positive_evidence: z.array(scoreEvidenceValidator),
  limiting_evidence: z.array(scoreEvidenceValidator)
}).strict();

export const evaluatorValidator = z.object({
  evaluator_id: z.string().min(1),
  evidence_status: z.enum(["complete", "partial", "insufficient"]),
  criteria: z.object({
    FC: criterionEvaluationValidator,
    LR: criterionEvaluationValidator,
    GRA: criterionEvaluationValidator,
    P: criterionEvaluationValidator
  }).strict(),
  diagnosis_zh: z.string().min(1),
  evidence_corrections: z.array(z.object({
    turn_id: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    original: z.string(),
    improved: z.string(),
    reason_zh: z.string().min(1)
  }).strict())
}).strict().superRefine((value, context) => {
  if (value.evidence_status !== "complete") return;
  for (const criterion of criterionKeys) {
    const item = value.criteria[criterion];
    if (item.positive_evidence.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria", criterion, "positive_evidence"],
        message: "Complete evidence requires at least two strengths"
      });
    }
    if (item.limiting_evidence.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria", criterion, "limiting_evidence"],
        message: "Complete evidence requires at least two limitations"
      });
    }
    if (criterion === "P") {
      const directStrengths = item.positive_evidence.filter((entry) => entry.audio_feature).length;
      const directLimitations = item.limiting_evidence.filter((entry) => entry.audio_feature).length;
      if (directStrengths < 2) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criteria", criterion, "positive_evidence"],
          message: "Pronunciation requires at least two direct-audio strengths"
        });
      }
      if (directLimitations < 2) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criteria", criterion, "limiting_evidence"],
          message: "Pronunciation requires at least two direct-audio limitations"
        });
      }
    }
  }
});

export const adjudicationValidator = z.object({
  results: z.array(z.object({
    criterion: z.enum(criterionKeys),
    band: z.number().min(0).max(9).multipleOf(0.5),
    reason_zh: z.string().min(1),
    positive_evidence: z.array(scoreEvidenceValidator).min(1),
    limiting_evidence: z.array(scoreEvidenceValidator).min(1)
  }).strict()).min(1)
}).strict();

const number = { type: "number" };
const nonNegativeNumber = { type: "number", minimum: 0 };
const string = { type: "string" };
const scoreEvidenceJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    turn_id: string,
    start: number,
    end: number,
    audio_feature: {
      anyOf: [
        {
          type: "string",
          enum: [
            "chunking",
            "rhythm",
            "stress",
            "intonation",
            "connected_speech",
            "word_stress",
            "phoneme",
            "intelligibility"
          ]
        },
        { type: "null" }
      ]
    },
    note: string
  },
  required: ["turn_id", "start", "end", "audio_feature", "note"]
};
const criterionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Keep the provider-facing schema structural. Some strict-output
    // providers reject numeric JSON-Schema constraints such as multipleOf;
    // Zod below remains the authoritative range/half-band validator.
    band: number,
    why: string,
    why_not_higher: string,
    positive_evidence: { type: "array", items: scoreEvidenceJsonSchema },
    limiting_evidence: { type: "array", items: scoreEvidenceJsonSchema }
  },
  required: ["band", "why", "why_not_higher", "positive_evidence", "limiting_evidence"]
};

export const turnAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    turnId: string,
    part: { type: "integer", minimum: 1, maximum: 3 },
    prompt: string,
    durationSeconds: { type: "number", exclusiveMinimum: 0 },
    transcript: string,
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { start: nonNegativeNumber, end: nonNegativeNumber, text: string },
        required: ["start", "end", "text"]
      }
    },
    audioEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          start: nonNegativeNumber,
          end: nonNegativeNumber,
          polarity: { type: "string", enum: ["strength", "limitation"] },
          audio_feature: {
            type: "string",
            enum: [
              "chunking",
              "rhythm",
              "stress",
              "intonation",
              "connected_speech",
              "word_stress",
              "phoneme",
              "intelligibility"
            ]
          },
          note: string
        },
        required: ["start", "end", "polarity", "audio_feature", "note"]
      }
    },
    performanceCounts: {
      type: "object",
      additionalProperties: false,
      properties: {
        approximateWords: { type: "integer", minimum: 0 },
        falseStartOrRepairClusters: { type: "integer", minimum: 0 },
        clearCoherenceLosses: { type: "integer", minimum: 0 },
        successfulComplexSentences: { type: "integer", minimum: 0 },
        flawedComplexAttempts: { type: "integer", minimum: 0 },
        notableLessCommonOrIdiomaticItems: { type: "integer", minimum: 0 }
      },
      required: [
        "approximateWords",
        "falseStartOrRepairClusters",
        "clearCoherenceLosses",
        "successfulComplexSentences",
        "flawedComplexAttempts",
        "notableLessCommonOrIdiomaticItems"
      ]
    },
    quality: { type: "string", enum: ["good", "limited", "insufficient"] }
  },
  required: [
    "turnId",
    "part",
    "prompt",
    "durationSeconds",
    "transcript",
    "segments",
    "audioEvidence",
    "performanceCounts",
    "quality"
  ]
};

export const evaluatorJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    evaluator_id: string,
    evidence_status: { type: "string", enum: ["complete", "partial", "insufficient"] },
    criteria: {
      type: "object",
      additionalProperties: false,
      properties: {
        FC: criterionJsonSchema,
        LR: criterionJsonSchema,
        GRA: criterionJsonSchema,
        P: criterionJsonSchema
      },
      required: ["FC", "LR", "GRA", "P"]
    },
    diagnosis_zh: string,
    evidence_corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          turn_id: string,
          start: number,
          end: number,
          original: string,
          improved: string,
          reason_zh: string
        },
        required: ["turn_id", "start", "end", "original", "improved", "reason_zh"]
      }
    }
  },
  required: [
    "evaluator_id",
    "evidence_status",
    "criteria",
    "diagnosis_zh",
    "evidence_corrections"
  ]
};

export const adjudicationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          criterion: { type: "string", enum: criterionKeys },
          band: number,
          reason_zh: string,
          positive_evidence: { type: "array", items: scoreEvidenceJsonSchema },
          limiting_evidence: { type: "array", items: scoreEvidenceJsonSchema }
        },
        required: [
          "criterion",
          "band",
          "reason_zh",
          "positive_evidence",
          "limiting_evidence"
        ]
      }
    }
  },
  required: ["results"]
};

export type TurnAnalysisContract = z.infer<typeof turnAnalysisValidator>;
export type EvaluatorContract = z.infer<typeof evaluatorValidator>;
export type AdjudicationContract = z.infer<typeof adjudicationValidator>;
