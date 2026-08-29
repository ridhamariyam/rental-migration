import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Rentique"
      className={cn("object-contain rounded-md", className)}
    />
  );
}
