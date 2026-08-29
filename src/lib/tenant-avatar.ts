/**
 * Deterministic per-tenant visual identity — tenants have no logo of their
 * own yet, so every business name is turned into a stable set of initials
 * plus a gradient, both derived from the name itself so the same tenant
 * always renders the same way anywhere it appears (table row, detail page).
 */

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0; // force 32-bit int
  }
  return Math.abs(hash);
}

/** "Anaya Bridal Studio" → "AB" */
export function initialsFor(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (letters || "?").toUpperCase();
}

/** A two-stop `linear-gradient(...)` string, ready for a `backgroundImage`. */
export function avatarGradient(seed: string): string {
  const hash = hashString(seed);
  const hue = hash % 360;
  const hue2 = (hue + 26) % 360;
  return `linear-gradient(135deg, hsl(${hue} 85% 63%), hsl(${hue2} 80% 47%))`;
}

const STAFF_AVATAR_COUNT = 3;

/** Deterministic avatar image — same name always gets the same photo. */
export function staffAvatarSrc(name: string): string {
  const index = (hashString(name) % STAFF_AVATAR_COUNT) + 1;
  return `/avatars/${index}.png`;
}

/**
 * A real, uploaded photo (Profile page for a person; Business Settings'
 * logo for a shop) always takes priority over the deterministic
 * placeholder/gradient — the placeholder only exists as a stand-in for
 * when nobody has uploaded a real image yet. Every avatar render in the
 * app should resolve its `src` through this helper rather than calling
 * `staffAvatarSrc(name)` directly.
 */
export function resolveAvatarSrc(
  uploadedUrl: string | null | undefined,
  name: string,
): string {
  return uploadedUrl || staffAvatarSrc(name);
}

/** Frosted glassmorphism avatar style derived deterministically from customer name */
export function customerGlassAvatarStyle(seed: string): React.CSSProperties {
  const hash = hashString(seed);
  const hue = hash % 360;
  const hue2 = (hue + 45) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.05) 50%), linear-gradient(135deg, hsl(${hue} 80% 58%), hsl(${hue2} 85% 42%))`,
    boxShadow: "0 3px 10px rgba(0, 0, 0, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.7)",
    border: "1.5px solid rgba(255, 255, 255, 0.5)",
    backdropFilter: "blur(6px)",
    color: "#ffffff",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
  };
}

/** Deterministic product avatar background gradient */
export function productAvatarGradient(seed: string): string {
  const hash = hashString(seed);
  const hue = (hash * 37) % 360;
  const hue2 = (hue + 35) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${hue2} 75% 40%))`;
}
