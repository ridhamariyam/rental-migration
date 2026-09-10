import { cn } from "@/lib/utils";

/**
 * The product's entire brand identity: the name, set as type.
 *
 * There is deliberately no logo, monogram or brand icon anywhere in this
 * project — not in the sidebars, not on the sign-in screens. If the product
 * needs to identify itself, it does so with this component. Anything that
 * would reintroduce a mark (an `R` badge, an app icon used as branding, an
 * `/logo.*` image) belongs nowhere in the tree.
 *
 * `size` maps to the two places the name appears: `sm` in a sidebar header,
 * `md` at the top of an authentication panel.
 */
export function Wordmark({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Tight tracking and a medium weight is what makes a plain word read
        // as a wordmark rather than as a heading that happens to be first.
        "font-sans font-medium tracking-[-0.02em] whitespace-nowrap",
        size === "sm" ? "text-[19px]" : "text-[22px]",
        className,
      )}
    >
      Rentque
    </span>
  );
}
