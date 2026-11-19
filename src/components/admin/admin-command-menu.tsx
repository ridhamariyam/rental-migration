"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2Icon, LayoutDashboardIcon, SearchIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { adminPaths } from "@/lib/admin-paths";

/**
 * Everything the palette can currently jump to. Kept as a plain list next
 * to `navItems` in `app-sidebar.tsx` rather than importing one from the
 * other — both are small and independent; unify them only if this list
 * grows enough that the duplication actually hurts.
 */
const searchableItems = [
  { href: adminPaths.dashboard, label: "Dashboard", icon: LayoutDashboardIcon },
  { href: adminPaths.tenants, label: "Tenants", icon: Building2Icon },
];

/** Sidebar search box + Cmd/Ctrl-K command palette for jumping between admin pages. */
export function AdminCommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `event.key` can be missing/empty on some synthesized keydown events
      // (autofill, certain IME/composition steps, some browser extensions)
      // — guard instead of letting `.toLowerCase()` throw and crash the
      // listener for the whole document.
      if (
        event.key?.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const goTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <SidebarMenuButton
        tooltip="Search"
        onClick={() => setOpen(true)}
        // A resting `bg-background` + visible border so this reads as an
        // actual input against the (now grayer) sidebar, not just another
        // nav row — the default SidebarMenuButton has no fill at rest and
        // was blending straight into the sidebar background.
        className="border-input bg-background text-muted-foreground hover:bg-background hover:text-foreground border shadow-xs"
      >
        <SearchIcon />
        <span className="min-w-0 flex-1 truncate text-left">Search…</span>
        <kbd className="bg-muted text-muted-foreground border-border ml-auto inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium group-data-[collapsible=icon]:hidden">
          ⌘K
        </kbd>
      </SidebarMenuButton>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Jump to a page in the admin console"
      >
        {/* This style's CommandDialog doesn't wrap children in a Command
            root itself (unlike the classic shadcn version) — CommandInput/
            CommandList need one for cmdk's context, or they throw trying to
            read it. */}
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigate">
              {searchableItems.map((item) => (
                <CommandItem key={item.href} onSelect={() => goTo(item.href)}>
                  <item.icon />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
