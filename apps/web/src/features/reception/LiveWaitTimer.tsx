import { type FC, useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface LiveWaitTimerProps {
  checkedInAt: string | null | undefined;
  thresholdWarnMinutes?: number;
  thresholdCritMinutes?: number;
}

export const LiveWaitTimer: FC<LiveWaitTimerProps> = ({
  checkedInAt,
  thresholdWarnMinutes = 15,
  thresholdCritMinutes = 30,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!checkedInAt) return;

    const calculate = () => {
      const start = new Date(checkedInAt).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - start) / 1000));
      setElapsedSeconds(diffSec);
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [checkedInAt]);

  if (!checkedInAt) {
    return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  const isCritical = minutes >= thresholdCritMinutes;
  const isWarning = minutes >= thresholdWarnMinutes && !isCritical;

  const formattedTime =
    hours > 0 ? `${hours}h ${remainingMinutes}m ${seconds}s` : `${minutes}m ${seconds}s`;

  let badgeColor = 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

  if (isWarning) {
    badgeColor = 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60';
  } else if (isCritical) {
    badgeColor = 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60 font-semibold';
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono ${badgeColor}`}
    >
      {isCritical ? (
        <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
      ) : (
        <Clock className="w-3 h-3 text-current shrink-0 opacity-60" />
      )}
      <span>{formattedTime}</span>
      {isWarning && (
        <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
          Wait
        </span>
      )}
      {isCritical && (
        <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300">
          Delay
        </span>
      )}
    </div>
  );
};
