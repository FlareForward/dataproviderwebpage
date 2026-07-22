import { useEffect, useState } from "react";
import { PauseCircle } from "lucide-react";

/**
 * Shown when Flare Forward is not registered / not submitting for the current
 * reward epoch. Rather than surface pre-submission QA estimates (which can be
 * misleading), we tell users the epoch was missed and count down to when
 * submissions resume with the next epoch.
 */
export function EpochGapNotice({
  rewardEpoch,
  gapReason,
  expectedResumeUtc,
}: {
  rewardEpoch?: number | null;
  gapReason?: string | null;
  expectedResumeUtc?: string | null;
}) {
  const countdown = useCountdown(expectedResumeUtc);
  const resumeLabel = expectedResumeUtc
    ? new Date(expectedResumeUtc).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="glass-panel border-yellow-500/30 p-6 sm:p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400">
          <PauseCircle size={26} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#FAFAFA]">
            {rewardEpoch != null
              ? `Reward epoch ${rewardEpoch} registration missed`
              : "Registration missed for the current epoch"}
          </h3>
          <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-[#8FA0B8]">
            Flare Forward is not in the signing policy this epoch, so we are not
            submitting data on-chain. Accuracy figures are paused rather than
            shown as estimates. Data submissions resume with the next reward
            epoch.
            {gapReason ? (
              <span className="mt-1 block text-[#8FA0B8]/70">{gapReason}.</span>
            ) : null}
          </p>
        </div>

        {countdown && !countdown.done ? (
          <div className="mt-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8FA0B8]">
              Resumes in
            </div>
            <div className="mt-2 flex items-start justify-center gap-2 sm:gap-3">
              <TimeSegment value={countdown.days} label="days" />
              <Colon />
              <TimeSegment value={countdown.hours} label="hrs" />
              <Colon />
              <TimeSegment value={countdown.minutes} label="min" />
              <Colon />
              <TimeSegment value={countdown.seconds} label="sec" />
            </div>
            {resumeLabel ? (
              <div className="mt-3 text-xs text-[#8FA0B8]/80">
                Expected {resumeLabel}
              </div>
            ) : null}
          </div>
        ) : countdown?.done ? (
          <div className="mt-1 text-sm font-medium text-yellow-400">
            Resuming shortly — awaiting the next epoch's first submissions…
          </div>
        ) : (
          <div className="mt-1 text-sm text-[#8FA0B8]">
            Submissions resume with the next reward epoch.
          </div>
        )}
      </div>
    </div>
  );
}

function TimeSegment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="min-w-[2.75rem] rounded-lg bg-white/5 px-2 py-1.5 text-2xl font-bold tabular-nums text-[#FAFAFA] sm:text-3xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-wider text-[#8FA0B8]">
        {label}
      </span>
    </div>
  );
}

function Colon() {
  return (
    <span className="pt-1 text-2xl font-bold text-[#8FA0B8]/50 sm:text-3xl">
      :
    </span>
  );
}

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Live 1s countdown to a UTC target; null when no target is provided. */
function useCountdown(targetUtc?: string | null): Countdown | null {
  const target = targetUtc ? new Date(targetUtc).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null || Number.isNaN(target)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (target === null || Number.isNaN(target)) return null;

  const ms = target - now;
  if (ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: false,
  };
}
