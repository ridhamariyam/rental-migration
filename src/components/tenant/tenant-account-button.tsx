"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon, LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { apiRequest } from "@/lib/api-client";
import { resolveAvatarSrc } from "@/lib/tenant-avatar";

function initialsFor(firstName: string, lastName: string): string {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`;
  return (initials || "U").toUpperCase();
}

export function TenantAccountButton({
  firstName,
  lastName,
  email,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const { isMobile } = useSidebar();
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
    <DropdownMenu>
      <DropdownMenuTrigger
        className="w-full rounded-lg p-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-colors data-popup-open:bg-sidebar-accent"
      >
        <div className="flex items-center gap-2">
          <Avatar className="size-8 rounded-lg shrink-0">
            <AvatarImage
              src={resolveAvatarSrc(avatarUrl, `${firstName} ${lastName}`)}
              alt={`${firstName} ${lastName}`}
            />
            <AvatarFallback className="rounded-lg">{initialsFor(firstName, lastName)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold text-sidebar-foreground">{firstName} {lastName}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </div>
          <EllipsisVerticalIcon className="ml-auto size-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut ? <Spinner className="size-4" /> : <LogOutIcon />}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
