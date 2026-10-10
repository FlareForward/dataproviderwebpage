import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

const KEY_PREFIX = "ff:bond-claim-notice:v1:";

/** Wallets that already saw the notice this session, for when storage is blocked. */
const seenThisSession = new Set<string>();

export function hasSeenClaimNotice(address: string): boolean {
  const id = address.toLowerCase();
  if (seenThisSession.has(id)) return true;
  try {
    return window.localStorage.getItem(KEY_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

export function markClaimNoticeSeen(address: string): void {
  const id = address.toLowerCase();
  seenThisSession.add(id);
  try {
    window.localStorage.setItem(KEY_PREFIX + id, "1");
  } catch {
    /* storage blocked: the session set above still keeps it to one showing */
  }
}

/**
 * One-time notice, shown the first time a wallet claims bond rewards after the
 * switch from the mirror epochs to the Flare staking payout. It gates the claim:
 * the holder reads it, then continues.
 */
export function ClaimNoticeDialog({
  onContinue,
  onCancel,
}: {
  onContinue: () => void;
  onCancel: () => void;
}) {
  // Portal to the body: a blurred parent card would otherwise trap a fixed overlay inside itself.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-notice-title"
    >
      <div className="glass-panel relative w-full max-w-md space-y-4 p-6">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-[#8FA0B8] transition hover:bg-white/10 hover:text-[#FAFAFA]"
        >
          <X size={16} />
        </button>
        <h2 id="claim-notice-title" className="pr-6 text-lg font-semibold text-[#FAFAFA]">
          Bond payouts are moving to the staking schedule
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-[#8FA0B8]">
          <p>
            We will pay out the next mirror epoch as usual. After that, bond rewards are released after each Flare
            staking payout, which comes every 14 days. Our goal is one business day after that release.
          </p>
          <p>
            This keeps payouts steady and smooth. Flare releases mirror rewards at a different time every 3.5 days,
            which makes a regular schedule hard to hold.
          </p>
          <p className="text-xs">You will only see this notice once.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="action" onClick={onContinue}>
            Got it, continue to claim
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
