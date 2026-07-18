// Core type definitions for TB IELTS Speaking Mock Examiner

export type Part = 1 | 2 | 3;

export interface Question {
  id: string;
  part: Part;
  text: string;
  /** Part 2 cue card topic */
  topic?: string;
  /** Part 2 cue card bullet points */
  bullets?: string[];
  /** Follow-up prompts for Part 2 */
  followUps?: string[];
}

export interface TestSet {
  id: string;
  /** Display name / topic cluster */
  name: string;
  part1Questions: string[];
  part2: {
    topic: string;
    bullets: string[];
    followUps: string[];
  };
  part3Questions: string[];
}

/** IELTS band scores: 0-9 in 0.5 increments */
export type BandScore = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5 | 5.5 | 6 | 6.5 | 7 | 7.5 | 8 | 8.5 | 9;

export interface CriterionScore {
  band: BandScore;
  /** Chinese explanation of why this band was awarded */
  explanation: string;
  /** Specific examples from the candidate's speech */
  examples: string[];
  /** Actionable improvement suggestions in Chinese */
  suggestions: string[];
}

export interface ScoringResult {
  /** Fluency and Coherence */
  fc: CriterionScore;
  /** Lexical Resource */
  lr: CriterionScore;
  /** Grammatical Range and Accuracy */
  gra: CriterionScore;
  /** Pronunciation */
  p: CriterionScore;
  /** Overall band (average of 4 criteria, rounded to nearest 0.5) */
  overall: BandScore;
  /** Full Chinese written feedback */
  writtenFeedback: string;
  /** Chinese summary for TTS spoken playback */
  spokenFeedback: string;
}

export interface TurnRecord {
  part: Part;
  questionIndex: number;
  question: string;
  /** Transcribed text from ASR */
  transcript: string;
  /** Audio blob URL for playback */
  audioUrl: string;
  /** Duration in seconds */
  duration: number;
}

export type ExamPhase =
  | 'idle'
  | 'part1-intro'
  | 'part1-question'
  | 'part1-recording'
  | 'part2-prep'
  | 'part2-intro'
  | 'part2-recording'
  | 'part3-intro'
  | 'part3-question'
  | 'part3-recording'
  | 'scoring'
  | 'results';

export interface ExamState {
  phase: ExamPhase;
  currentPart: Part;
  currentQuestionIndex: number;
  testSet: TestSet | null;
  turns: TurnRecord[];
  scoringResult: ScoringResult | null;
  /** Part 2 prep time remaining (seconds) */
  prepTimeRemaining: number;
  /** Current recording duration (seconds) */
  recordingDuration: number;
}
