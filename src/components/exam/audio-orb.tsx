'use client';

import { cn } from '@/lib/utils';

interface AudioOrbProps {
  isRecording: boolean;
  isIdle: boolean;
  onClick?: () => void;
  label?: string;
  duration?: number;
}

export function AudioOrb({
  isRecording,
  isIdle,
  onClick,
  label,
  duration,
}: AudioOrbProps) {
  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Ripple rings when recording */}
      {isRecording && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-[var(--cyan-glow)] animate-ripple" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-[var(--cyan-glow)] animate-ripple"
            style={{ animationDelay: '0.5s' }}
          />
        </>
      )}

      {/* Main orb */}
      <button
        onClick={onClick}
        disabled={isIdle}
        className={cn(
          'relative z-10 w-32 h-32 rounded-full flex items-center justify-center',
          'transition-all duration-300 cursor-pointer',
          'border-2 border-[var(--cyan-glow)]/30',
          isRecording
            ? 'animate-orb-record bg-[var(--cyan-glow)]/20'
            : isIdle
              ? 'animate-orb-breathe bg-[var(--cyan-glow)]/10 cursor-default'
              : 'bg-[var(--cyan-glow)]/15 hover:bg-[var(--cyan-glow)]/25 hover:shadow-[0_0_20px_oklch(0.78_0.14_195/0.5)]'
        )}
      >
        {/* Inner glow */}
        <div
          className={cn(
            'w-16 h-16 rounded-full transition-all duration-300',
            isRecording
              ? 'bg-[var(--cyan-glow)]/60 shadow-[0_0_30px_var(--cyan-glow)]'
              : 'bg-[var(--cyan-glow)]/30 shadow-[0_0_15px_var(--cyan-glow-dim)]'
          )}
        />
      </button>

      {/* Label */}
      {label && (
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </span>
      )}

      {/* Duration */}
      {duration !== undefined && duration > 0 && (
        <span className="font-mono text-lg text-[var(--cyan-glow)] tabular-nums">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
