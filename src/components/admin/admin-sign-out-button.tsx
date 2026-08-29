"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { adminPaths } from "@/lib/admin-paths";
import { apiRequest } from "@/lib/api-client";

function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "SA").toUpperCase();
}

/**
 * The sidebar footer's account row: identity (avatar + email) and the
 * sign-out action live in one rounded, hoverable card — not two stacked,
 * disconnected elements — so it reads as a single "account" affordance,
 * matching the rounded/white-on-gray treatment used everywhere else in the
 * shell (see plan.md § Phase 2 post-review polish).
 */
export function AdminSignOutButton({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await apiRequest("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.push(adminPaths.login);
      router.refresh();
    }
  };

  return (
    <SidebarMenuButton
      size="lg"
      tooltip="Sign out"
      disabled={isSigningOut}
      onClick={handleSignOut}
      // See the header wordmark button for why icon-collapsed mode needs an
      // explicit justify-center override on `lg`-sized buttons.
      className="bg-background hover:bg-muted rounded-lg group-data-[collapsible=icon]:justify-center"
    >
      <Avatar className="shrink-0 group-data-[collapsible=icon]:hidden">
        <AvatarImage src="/avatars/avatar.png" alt="" />
        <AvatarFallback>{initialsFor(adminEmail)}</AvatarFallback>
      </Avatar>
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs group-data-[collapsible=icon]:hidden">
        {adminEmail}
      </span>
      {isSigningOut ? (
        <Spinner />
      ) : (
        <LogOutIcon className="text-muted-foreground size-4 shrink-0" />
      )}
    </SidebarMenuButton>
  );
}
