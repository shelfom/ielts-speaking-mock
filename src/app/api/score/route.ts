import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import type { ScoringResult, BandScore, CriterionScore } from '@/lib/types';

interface ScoringRequest {
  transcripts: {
    part: number;
    question: string;
    answer: string;
  }[];
}

const SCORING_SYSTEM_PROMPT = `You are an expert IELTS Speaking examiner with 20+ years of experience. You must score the candidate's spoken English according to the official IELTS Speaking Band Descriptors.

You will receive transcripts of the candidate's answers across Part 1, Part 2, and Part 3 of the IELTS Speaking test. Based on these transcripts, you must provide detailed scoring.

## Scoring Criteria (each scored 0-9 in 0.5 increments):
1. **Fluency and Coherence (FC)**: Flow of speech, coherence, connectives, hesitation
2. **Lexical Resource (LR)**: Vocabulary range, precision, collocation, paraphrasing
3. **Grammatical Range and Accuracy (GRA)**: Sentence structures, error frequency, complexity
4. **Pronunciation (P)**: Since you only have transcripts, assess pronunciation indicators through word choices, natural phrasing, and note that this score should be estimated based on the overall quality of language use. If the transcript shows natural spoken patterns, rate slightly higher; if it shows very written/formal patterns, rate slightly lower.

## Overall Band:
Average of the 4 criteria, rounded to the nearest 0.5.

## Output Format:
You MUST respond with valid JSON only, no markdown, no code blocks. The JSON structure must be:
{
  "fc": {
    "band": <number>,
    "explanation": "<Chinese explanation of why this band>",
    "examples": ["<specific example from transcript>", ...],
    "suggestions": ["<Chinese improvement suggestion>", ...]
  },
  "lr": {
    "band": <number>,
    "explanation": "<Chinese>",
    "examples": ["<example>", ...],
    "suggestions": ["<Chinese suggestion>", ...]
  },
  "gra": {
    "band": <number>,
    "explanation": "<Chinese>",
    "examples": ["<example>", ...],
    "suggestions": ["<Chinese suggestion>", ...]
  },
  "p": {
    "band": <number>,
    "explanation": "<Chinese>",
    "examples": ["<example>", ...],
    "suggestions": ["<Chinese suggestion>", ...]
  },
  "overall": <number>,
  "writtenFeedback": "<Full Chinese written feedback, 200-400 characters, covering strengths, weaknesses, and study advice>",
  "spokenFeedback": "<Chinese spoken feedback script for TTS, 100-200 characters, natural spoken style summarizing the key points>"
}

All explanations, suggestions, writtenFeedback, and spokenFeedback MUST be in Chinese (Simplified).
Band scores must be valid IELTS bands: 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, or 9.
Be strict and realistic in scoring. Do not inflate scores.`;

function validateBandScore(band: number): BandScore {
  const validBands: BandScore[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
  if (validBands.includes(band as BandScore)) {
    return band as BandScore;
  }
  // Round to nearest 0.5
  const rounded = Math.round(band * 2) / 2;
  return Math.max(0, Math.min(9, rounded)) as BandScore;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ScoringRequest;
    const { transcripts } = body;

    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return NextResponse.json(
        { error: 'No transcripts provided for scoring' },
        { status: 400 }
      );
    }

    // Build the user message with all transcripts
    const transcriptText = transcripts
      .map((t) => {
        const partLabel = `Part ${t.part}`;
        return `【${partLabel}】\nQuestion: ${t.question}\nCandidate Answer: ${t.answer}`;
      })
      .join('\n\n---\n\n');

    const userMessage = `Please score the following IELTS Speaking test transcripts:\n\n${transcriptText}`;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SCORING_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.3,
    });

    // Parse the JSON response
    let rawContent = response.content.trim();
    // Remove potential markdown code blocks
    if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(rawContent) as ScoringResult;

    // Validate and normalize band scores
    const result: ScoringResult = {
      fc: {
        ...parsed.fc,
        band: validateBandScore(parsed.fc.band),
      } as CriterionScore,
      lr: {
        ...parsed.lr,
        band: validateBandScore(parsed.lr.band),
      } as CriterionScore,
      gra: {
        ...parsed.gra,
        band: validateBandScore(parsed.gra.band),
      } as CriterionScore,
      p: {
        ...parsed.p,
        band: validateBandScore(parsed.p.band),
      } as CriterionScore,
      overall: validateBandScore(parsed.overall),
      writtenFeedback: parsed.writtenFeedback,
      spokenFeedback: parsed.spokenFeedback,
    };

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Scoring error:', error);
    return NextResponse.json(
      { error: 'AI scoring failed. Please try again.' },
      { status: 500 }
    );
  }
}
