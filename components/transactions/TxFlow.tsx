"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExplorerLink } from "./ExplorerLink";
import type { TxFlowState } from "@/hooks/useTxFlow";

interface Props extends TxFlowState {
  /** Called when the user confirms the review step. */
  onConfirm: () => void;
  onBack?: () => void;
  onDone?: () => void;
  confirmLabel: string;
  /** Review summary content (what changes, resulting HF, liquidation price). */
  children: React.ReactNode;
  /** Explains the approval step when one may be required. */
  approvalNote?: string;
  /** Blocks the confirm button with a reason (e.g. validation failure). */
  blocked?: string | null;
}

/**
 * Shared transaction flow: review -> approve (if needed) -> submit -> pending (hash + explorer)
 * -> confirmed (receipt) / reverted (decoded reason). Success is never shown before the receipt.
 */
export function TxFlow({ status, hash, approvalHash, error, onConfirm, onBack, onDone, confirmLabel, children, approvalNote, blocked }: Props) {
  const busy = status === "approving" || status === "submitting" || status === "pending";

  if (status === "confirmed" && hash) {
    return (
      <div className="grid gap-4">
        <div className="flex items-start gap-3 rounded-lg border border-health-good/30 bg-health-good-bg p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-health-good" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">Confirmed on Mezo Testnet.</p>
            <p className="mt-1 text-muted-foreground">
              Transaction <ExplorerLink kind="tx" value={hash} />
            </p>
          </div>
        </div>
        {onDone ? <Button onClick={onDone}>Done</Button> : null}
      </div>
    );
  }

  if (status === "reverted") {
    return (
      <div className="grid gap-4">
        <div className="flex items-start gap-3 rounded-lg border border-health-risk/30 bg-health-risk-bg p-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-health-risk" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">Transaction reverted.</p>
            <p className="mt-1 text-muted-foreground">{error?.message ?? "No reason was returned."}</p>
            {hash ? (
              <p className="mt-1 text-muted-foreground">
                Transaction <ExplorerLink kind="tx" value={hash} />
              </p>
            ) : null}
          </div>
        </div>
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {children}

      {busy ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm" aria-live="polite">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            {status === "approving" ? (
              <>
                <p className="font-medium text-foreground">Approving token spend…</p>
                <p className="mt-0.5 text-muted-foreground">
                  {approvalHash ? (
                    <>
                      Waiting for approval <ExplorerLink kind="tx" value={approvalHash} />
                    </>
                  ) : (
                    "Confirm the approval in your wallet."
                  )}
                </p>
              </>
            ) : status === "submitting" ? (
              <>
                <p className="font-medium text-foreground">Confirm in your wallet.</p>
                <p className="mt-0.5 text-muted-foreground">The transaction is simulated first; a revert shows here before gas is spent.</p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">Pending on Mezo Testnet…</p>
                <p className="mt-0.5 text-muted-foreground">
                  Transaction {hash ? <ExplorerLink kind="tx" value={hash} /> : null}. Waiting for the receipt.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!busy && error ? (
        <p role="alert" className="rounded-md bg-health-risk-bg px-3 py-2 text-sm text-health-risk">
          {error.message}
        </p>
      ) : null}

      {!busy && blocked ? <p className="text-xs text-muted-foreground">{blocked}</p> : null}
      {!busy && !blocked && approvalNote ? <p className="text-xs text-muted-foreground">{approvalNote}</p> : null}

      <div className="flex gap-2">
        {onBack ? (
          <Button variant="outline" onClick={onBack} disabled={busy}>
            Back
          </Button>
        ) : null}
        <Button onClick={onConfirm} disabled={busy || Boolean(blocked)} className="flex-1">
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
