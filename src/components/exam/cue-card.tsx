'use client';

interface CueCardProps {
  topic: string;
  bullets: string[];
}

export function CueCard({ topic, bullets }: CueCardProps) {
  return (
    <div className="cue-card p-5 sm:p-6 max-w-md mx-auto shadow-lg shadow-[var(--orange-cue)]/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-[var(--text-on-orange)]/60" />
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Part 2 — Cue Card
        </span>
      </div>

      {/* Topic */}
      <h3 className="text-base sm:text-lg font-semibold leading-snug mb-4">
        {topic}
      </h3>

      {/* Bullets */}
      <ul className="space-y-2">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--text-on-orange)]/40 shrink-0" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {/* Footer note */}
      <p className="mt-4 text-xs opacity-60 italic">
        You should say about this topic for 1–2 minutes.
      </p>
    </div>
  );
}
