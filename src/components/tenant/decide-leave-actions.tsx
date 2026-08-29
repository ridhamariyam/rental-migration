"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";

export function DecideLeaveActions({ leaveId }: { leaveId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "approved" | "rejected") {
    setError(null);
    setPending(status);

    try {
      await apiRequest(`/api/leave/${leaveId}/decide`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : "Something went wrong.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error ? (
        <span className="text-destructive text-xs">{error}</span>
      ) : null}
      <Button
        size="icon-sm"
        variant="accent"
        aria-label="Approve"
        disabled={pending !== null}
        onClick={() => decide("approved")}
      >
        {pending === "approved" ? <Spinner /> : <CheckIcon className="size-3.5" />}
      </Button>
      <Button
        size="icon-sm"
        variant="destructive"
        aria-label="Reject"
        disabled={pending !== null}
        onClick={() => decide("rejected")}
      >
        {pending === "rejected" ? <Spinner /> : <XIcon className="size-3.5" />}
      </Button>
    </div>
  );
}
