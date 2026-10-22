import { PauseCircle } from "lucide-react";

/**
 * Shown when Flare Forward is not registered / not submitting for the current
 * reward epoch. Rather than surface pre-submission QA estimates (which can be
 * misleading), we tell users the epoch was missed and show the expected static
 * resume time when the source provides one.
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

        <div className="mt-1 text-sm text-[#8FA0B8]">
          {resumeLabel
            ? `Submissions are expected to resume ${resumeLabel}.`
            : "Submissions resume with the next reward epoch."}
        </div>
      </div>
    </div>
  );
}
