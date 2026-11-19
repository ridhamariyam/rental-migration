"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Signs the visitor into the shared demo account and opens the dashboard. */
export function DemoButton({
  className,
  label = "Try the live demo",
  variant = "default",
}: {
  className?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiRequest("/api/auth/demo", { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Couldn't open the demo. Please try again.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        onClick={start}
        disabled={loading}
        className={cn("h-11 rounded-[10px] px-5 text-[15px]", className)}
      >
        {loading ? <Spinner /> : <PlayCircleIcon />}
        {loading ? "Opening demo…" : label}
      </Button>
      {error ? <p className="text-auth-danger text-sm">{error}</p> : null}
    </div>
  );
}
