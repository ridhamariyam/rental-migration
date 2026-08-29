"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiRequest } from "@/lib/api-client";

export function TenantSignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isSigningOut}
      onClick={handleSignOut}
    >
      {isSigningOut ? <Spinner /> : <LogOutIcon />}
      Sign out
    </Button>
  );
}
