export type TopicGroup = {
  topic: string;
  sourceRow: number;
  questions: string[];
};

export type MockTest = {
  id: string;
  title: string;
  part1: TopicGroup[];
  part2: {
    topic: string;
    sourceRow: number;
    cueCard: string[];
    preparationSeconds: number;
    speakingSeconds: number;
    closingQuestion: string;
  };
  part3: {
    topic: string;
    sourceRow: number;
    questions: string[];
    mappingReason: string;
  };
};

export type ExamStep = {
  id: string;
  part: 1 | 2 | 3;
  prompt: string;
  kind: "intro" | "question" | "prep" | "long-turn" | "closing" | "finish";
  record: boolean;
  maxSeconds?: number;
};

export type TurnAnalysis = {
  turnId: string;
  part: number;
  prompt: string;
  durationSeconds: number;
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  audioEvidence: Array<{
    start: number;
    end: number;
    audio_feature: string;
    note: string;
  }>;
  quality: "good" | "limited" | "insufficient";
};
