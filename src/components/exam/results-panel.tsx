'use client';

import type { ScoringResult, BandScore } from '@/lib/types';
import { useState } from 'react';

interface ResultsPanelProps {
  result: ScoringResult;
  spokenAudioUri: string | null;
  onReplay: () => void;
  onRestart: () => void;
}

export function ResultsPanel({
  result,
  spokenAudioUri,
  onReplay,
  onRestart,
}: ResultsPanelProps) {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <div className="animate-fade-in-up w-full max-w-2xl mx-auto px-4 space-y-6">
      {/* Overall Score */}
      <div className="text-center space-y-2">
        <p className="text-sm text-[var(--text-secondary)] uppercase tracking-wider">
          Overall Band Score
        </p>
        <p
          className={`font-mono text-6xl font-bold ${getBandColorClass(result.overall)}`}
        >
          {result.overall.toFixed(1)}
        </p>
      </div>

      {/* Four Criteria */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CriterionCard label="FC" labelFull="Fluency & Coherence" score={result.fc.band} />
        <CriterionCard label="LR" labelFull="Lexical Resource" score={result.lr.band} />
        <CriterionCard label="GRA" labelFull="Grammar Range" score={result.gra.band} />
        <CriterionCard label="P" labelFull="Pronunciation" score={result.p.band} />
      </div>

      {/* Spoken Feedback Player */}
      {spokenAudioUri && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--border)]">
          <button
            onClick={onReplay}
            className="btn-cyan-glow px-4 py-2 text-sm rounded-lg"
          >
            Play Feedback
          </button>
          <audio src={spokenAudioUri} className="flex-1 h-8" controls preload="metadata" />
        </div>
      )}

      {/* Written Feedback Toggle */}
      <button
        onClick={() => setShowFeedback(!showFeedback)}
        className="w-full text-left px-4 py-3 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--border)] hover:border-[var(--cyan-glow-dim)] transition-colors"
      >
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {showFeedback ? 'Hide' : 'Show'} Detailed Written Feedback (中文)
        </span>
      </button>

      {showFeedback && (
        <div className="animate-fade-in-up space-y-4">
          {/* Overall written feedback */}
          <div className="p-4 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--border)]">
            <p className="text-sm leading-relaxed text-[var(--text-primary)]">
              {result.writtenFeedback}
            </p>
          </div>

          {/* Per-criterion details */}
          <CriterionDetail title="Fluency & Coherence (FC)" data={result.fc} />
          <CriterionDetail title="Lexical Resource (LR)" data={result.lr} />
          <CriterionDetail title="Grammatical Range & Accuracy (GRA)" data={result.gra} />
          <CriterionDetail title="Pronunciation (P)" data={result.p} />
        </div>
      )}

      {/* Restart */}
      <div className="text-center pt-4">
        <button
          onClick={onRestart}
          className="btn-cyan-glow px-8 py-3 rounded-lg text-sm"
        >
          Take Another Mock Test
        </button>
      </div>
    </div>
  );
}

function CriterionCard({
  label,
  labelFull,
  score,
}: {
  label: string;
  labelFull: string;
  score: BandScore;
}) {
  return (
    <div
      className="p-3 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--border)] text-center"
      title={labelFull}
    >
      <p className="text-xs text-[var(--text-secondary)] mb-1">{label}</p>
      <p className={`font-mono text-2xl font-bold ${getBandColorClass(score)}`}>
        {score.toFixed(1)}
      </p>
    </div>
  );
}

function CriterionDetail({
  title,
  data,
}: {
  title: string;
  data: {
    band: BandScore;
    explanation: string;
    examples: string[];
    suggestions: string[];
  };
}) {
  return (
    <div className="p-4 rounded-lg bg-[var(--bg-panel-elevated)] border border-[var(--border)] space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h4>
        <span
          className={`font-mono text-lg font-bold ${getBandColorClass(data.band)}`}
        >
          {data.band.toFixed(1)}
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {data.explanation}
      </p>
      {data.examples.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1 font-medium">
            Examples:
          </p>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1">
            {data.examples.map((ex, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-[var(--cyan-glow-dim)]">-</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.suggestions.length > 0 && (
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1 font-medium">
            Suggestions:
          </p>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1">
            {data.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-[var(--orange-cue)]">*</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function getBandColorClass(band: BandScore): string {
  if (band >= 7) return 'band-high';
  if (band >= 5.5) return 'band-mid';
  return 'band-low';
}
