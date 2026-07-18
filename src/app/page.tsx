'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ExamPhase, TestSet, TurnRecord, ScoringResult } from '@/lib/types';
import { getRandomTestSet } from '@/lib/question-bank';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { AudioOrb } from '@/components/exam/audio-orb';
import { CueCard } from '@/components/exam/cue-card';
import { ResultsPanel } from '@/components/exam/results-panel';

export default function ExamPage() {
  const [phase, setPhase] = useState<ExamPhase>('idle');
  const [testSet, setTestSet] = useState<TestSet | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [spokenAudioUri, setSpokenAudioUri] = useState<string | null>(null);
  const [prepTime, setPrepTime] = useState(60);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Start Exam ──
  const startExam = useCallback(() => {
    const ts = getRandomTestSet();
    setTestSet(ts);
    setCurrentQIndex(0);
    setTurns([]);
    setScoringResult(null);
    setSpokenAudioUri(null);
    setPhase('part1-intro');
  }, []);

  // ── Part 1 Flow ──
  const currentPart1Question =
    testSet?.part1Questions[currentQIndex] ?? '';

  const startPart1Recording = useCallback(async () => {
    setPhase('part1-recording');
    await startRecording();
  }, [startRecording]);

  const stopPart1Recording = useCallback(async () => {
    const { blob, url, duration } = await stopRecording();
    const turn: TurnRecord = {
      part: 1,
      questionIndex: currentQIndex,
      question: currentPart1Question,
      transcript: '',
      audioUrl: url,
      duration,
    };

    setTurns((prev) => [...prev, turn]);
    setIsProcessing(true);
    setStatusMessage('Transcribing your answer...');

    // ASR
    const transcript = await transcribeAudio(blob);
    setTurns((prev) =>
      prev.map((t, i) =>
        i === prev.length - 1 ? { ...t, transcript } : t
      )
    );

    setIsProcessing(false);
    setStatusMessage('');

    // Move to next Part 1 question or Part 2
    if (currentQIndex < (testSet?.part1Questions.length ?? 0) - 1) {
      setCurrentQIndex((prev) => prev + 1);
      setPhase('part1-question');
    } else {
      // Move to Part 2 prep
      setPrepTime(60);
      setPhase('part2-prep');
      startPrepTimer();
    }
  }, [stopRecording, currentQIndex, currentPart1Question, testSet]);

  // ── Part 2 Prep Timer ──
  const startPrepTimer = useCallback(() => {
    setPrepTime(60);
    prepTimerRef.current = setInterval(() => {
      setPrepTime((prev) => {
        if (prev <= 1) {
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, []);

  const startPart2Recording = useCallback(async () => {
    if (prepTimerRef.current) {
      clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }
    setPhase('part2-recording');
    setCurrentQIndex(0);
    await startRecording();
  }, [startRecording]);

  const stopPart2Recording = useCallback(async () => {
    const { blob, url, duration } = await stopRecording();
    const turn: TurnRecord = {
      part: 2,
      questionIndex: 0,
      question: testSet?.part2.topic ?? '',
      transcript: '',
      audioUrl: url,
      duration,
    };

    setTurns((prev) => [...prev, turn]);
    setIsProcessing(true);
    setStatusMessage('Transcribing your Part 2 response...');

    const transcript = await transcribeAudio(blob);
    setTurns((prev) =>
      prev.map((t, i) =>
        i === prev.length - 1 ? { ...t, transcript } : t
      )
    );

    setIsProcessing(false);
    setStatusMessage('');

    // Move to Part 3
    setCurrentQIndex(0);
    setPhase('part3-question');
  }, [stopRecording, testSet]);

  // ── Part 3 Flow ──
  const currentPart3Question =
    testSet?.part3Questions[currentQIndex] ?? '';

  const startPart3Recording = useCallback(async () => {
    setPhase('part3-recording');
    await startRecording();
  }, [startRecording]);

  const stopPart3Recording = useCallback(async () => {
    const { blob, url, duration } = await stopRecording();
    const turn: TurnRecord = {
      part: 3,
      questionIndex: currentQIndex,
      question: currentPart3Question,
      transcript: '',
      audioUrl: url,
      duration,
    };

    setTurns((prev) => [...prev, turn]);
    setIsProcessing(true);
    setStatusMessage('Transcribing...');

    const transcript = await transcribeAudio(blob);
    setTurns((prev) =>
      prev.map((t, i) =>
        i === prev.length - 1 ? { ...t, transcript } : t
      )
    );

    setIsProcessing(false);
    setStatusMessage('');

    if (currentQIndex < (testSet?.part3Questions.length ?? 0) - 1) {
      setCurrentQIndex((prev) => prev + 1);
      setPhase('part3-question');
    } else {
      // All done — start scoring
      setPhase('scoring');
    }
  }, [stopRecording, currentQIndex, currentPart3Question, testSet]);

  // ── Scoring ──
  useEffect(() => {
    if (phase !== 'scoring') return;

    const doScoring = async () => {
      setIsProcessing(true);
      setStatusMessage('AI examiner is evaluating your performance...');

      try {
        const transcripts = turns.map((t) => ({
          part: t.part,
          question: t.question,
          answer: t.transcript || '[No transcript available]',
        }));

        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcripts }),
        });

        if (!res.ok) throw new Error('Scoring failed');

        const data = (await res.json()) as { result: ScoringResult };
        setScoringResult(data.result);

        // Generate TTS for spoken feedback
        setStatusMessage('Generating spoken feedback...');
        const ttsRes = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.result.spokenFeedback }),
        });

        if (ttsRes.ok) {
          const ttsData = (await ttsRes.json()) as { audioUri: string };
          setSpokenAudioUri(ttsData.audioUri);
        }

        setPhase('results');
      } catch (err) {
        console.error('Scoring error:', err);
        setStatusMessage('Scoring failed. Please try again.');
        setPhase('results');
      } finally {
        setIsProcessing(false);
        setStatusMessage('');
      }
    };

    doScoring();
  }, [phase, turns]);

  // ── Restart ──
  const restart = useCallback(() => {
    setPhase('idle');
    setTestSet(null);
    setCurrentQIndex(0);
    setTurns([]);
    setScoringResult(null);
    setSpokenAudioUri(null);
  }, []);

  // ── Replay spoken feedback ──
  const replayFeedback = useCallback(() => {
    if (spokenAudioUri) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(spokenAudioUri);
      audioRef.current.play();
    }
  }, [spokenAudioUri]);

  // ── Current question text ──
  const currentQuestion = (() => {
    if (!testSet) return '';
    switch (phase) {
      case 'part1-question':
      case 'part1-recording':
        return testSet.part1Questions[currentQIndex] ?? '';
      case 'part2-recording':
        return testSet.part2.topic;
      case 'part3-question':
      case 'part3-recording':
        return testSet.part3Questions[currentQIndex] ?? '';
      default:
        return '';
    }
  })();

  // ── Render ──
  return (
    <div className="exam-panel flex flex-col items-center justify-center overflow-y-auto">
      {/* ── Idle / Welcome ── */}
      {phase === 'idle' && (
        <div className="animate-fade-in-up flex flex-col items-center gap-8 px-6 text-center">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
              TB IELTS Speaking
            </h1>
            <p className="text-lg text-[var(--text-secondary)]">
              Mock Examiner
            </p>
          </div>

          <p className="max-w-md text-sm text-[var(--text-secondary)] leading-relaxed">
            Take a full anonymous IELTS-style speaking test with Part 1, 2, and
            3. Your audio will be recorded turn by turn, transcribed, and scored
            by an AI examiner using official band descriptors for FC, LR, GRA,
            and Pronunciation.
          </p>

          <div className="space-y-3 text-xs text-[var(--text-secondary)]">
            <p>Part 1: 3 short questions (4-5 min)</p>
            <p>Part 2: 1 cue card topic (3-4 min with 1 min prep)</p>
            <p>Part 3: 3 discussion questions (4-5 min)</p>
          </div>

          <button
            onClick={startExam}
            className="btn-cyan-glow px-10 py-4 rounded-xl text-base"
          >
            Start Mock Test
          </button>

          <p className="text-xs text-[var(--text-secondary)]/60">
            Microphone access required. Audio is processed securely on the server.
          </p>
        </div>
      )}

      {/* ── Part 1 Intro ── */}
      {phase === 'part1-intro' && (
        <div className="animate-fade-in-up flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={1} />
          <h2 className="text-xl sm:text-2xl font-semibold">
            Part 1 — Introduction & Interview
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            I will ask you some general questions about familiar topics. Answer
            each question naturally, as in a real IELTS test.
          </p>
          <button
            onClick={() => setPhase('part1-question')}
            className="btn-cyan-glow px-8 py-3 rounded-lg text-sm"
          >
            Begin Part 1
          </button>
        </div>
      )}

      {/* ── Part 1 Question ── */}
      {phase === 'part1-question' && (
        <div className="animate-fade-in-up flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={1} />
          <p className="text-xs text-[var(--text-secondary)]">
            Question {currentQIndex + 1} of {testSet?.part1Questions.length}
          </p>
          <QuestionDisplay text={currentQuestion} />
          <button
            onClick={startPart1Recording}
            className="btn-cyan-glow px-8 py-3 rounded-lg text-sm"
          >
            Start Speaking
          </button>
        </div>
      )}

      {/* ── Part 1 Recording ── */}
      {phase === 'part1-recording' && (
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={1} />
          <QuestionDisplay text={currentQuestion} />
          <AudioOrb
            isRecording={isRecording}
            isIdle={false}
            onClick={stopPart1Recording}
            label="Tap to stop recording"
            duration={recordingDuration}
          />
        </div>
      )}

      {/* ── Part 2 Prep ── */}
      {phase === 'part2-prep' && testSet && (
        <div className="animate-fade-in-up flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={2} />
          <h2 className="text-lg font-semibold">Preparation Time</h2>
          <p className="font-mono text-4xl text-[var(--cyan-glow)] tabular-nums">
            {formatTime(prepTime)}
          </p>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            Read the cue card below and prepare your answer. You have 1 minute.
          </p>
          <CueCard
            topic={testSet.part2.topic}
            bullets={testSet.part2.bullets}
          />
          <button
            onClick={startPart2Recording}
            className="btn-cyan-glow px-8 py-3 rounded-lg text-sm"
          >
            {prepTime > 0 ? 'Start Speaking Now' : 'Begin Part 2'}
          </button>
        </div>
      )}

      {/* ── Part 2 Recording ── */}
      {phase === 'part2-recording' && testSet && (
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={2} />
          <CueCard
            topic={testSet.part2.topic}
            bullets={testSet.part2.bullets}
          />
          <AudioOrb
            isRecording={isRecording}
            isIdle={false}
            onClick={stopPart2Recording}
            label="Tap to stop recording"
            duration={recordingDuration}
          />
        </div>
      )}

      {/* ── Part 3 Question ── */}
      {phase === 'part3-question' && (
        <div className="animate-fade-in-up flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={3} />
          <p className="text-xs text-[var(--text-secondary)]">
            Question {currentQIndex + 1} of {testSet?.part3Questions.length}
          </p>
          <QuestionDisplay text={currentQuestion} />
          <button
            onClick={startPart3Recording}
            className="btn-cyan-glow px-8 py-3 rounded-lg text-sm"
          >
            Start Speaking
          </button>
        </div>
      )}

      {/* ── Part 3 Recording ── */}
      {phase === 'part3-recording' && (
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          <PartBadge part={3} />
          <QuestionDisplay text={currentQuestion} />
          <AudioOrb
            isRecording={isRecording}
            isIdle={false}
            onClick={stopPart3Recording}
            label="Tap to stop recording"
            duration={recordingDuration}
          />
        </div>
      )}

      {/* ── Scoring ── */}
      {phase === 'scoring' && (
        <div className="animate-fade-in-up flex flex-col items-center gap-6 px-6 text-center">
          <AudioOrb isRecording={false} isIdle={true} />
          <p className="text-lg font-medium text-[var(--text-primary)]">
            Evaluating your performance...
          </p>
          {statusMessage && (
            <p className="text-sm text-[var(--text-secondary)]">
              {statusMessage}
            </p>
          )}
        </div>
      )}

      {/* ── Results ── */}
      {phase === 'results' && scoringResult && (
        <div className="py-8 w-full">
          <ResultsPanel
            result={scoringResult}
            spokenAudioUri={spokenAudioUri}
            onReplay={replayFeedback}
            onRestart={restart}
          />
        </div>
      )}

      {/* ── Processing overlay ── */}
      {isProcessing && phase !== 'scoring' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--cyan-glow-dim)] text-sm text-[var(--text-secondary)] animate-fade-in-up">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

// ── Helper Components ──

function PartBadge({ part }: { part: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-panel-elevated)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)]">
      <span
        className={`w-2 h-2 rounded-full ${
          part === 1
            ? 'bg-[var(--cyan-glow)]'
            : part === 2
              ? 'bg-[var(--orange-cue)]'
              : 'bg-[var(--cyan-glow-dim)]'
        }`}
      />
      Part {part}
    </span>
  );
}

function QuestionDisplay({ text }: { text: string }) {
  return (
    <div className="max-w-lg p-4 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--border)]">
      <p className="text-base sm:text-lg leading-relaxed text-[var(--text-primary)]">
        {text}
      </p>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── ASR Helper ──
async function transcribeAudio(blob: Blob): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    const res = await fetch('/api/asr', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('ASR failed');

    const data = (await res.json()) as { text: string };
    return data.text || '';
  } catch (err) {
    console.error('Transcription error:', err);
    return '[Transcription unavailable]';
  }
}
