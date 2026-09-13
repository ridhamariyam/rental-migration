/**
 * The pastel accents the dashboard draws from — stat-tile icons, KPI cards,
 * quick links. The colours themselves are the `--color-pastel-*` tokens in
 * `globals.css`; each `-ink` shade is the matching dark text/icon colour,
 * checked at 4.9:1 contrast or better on its own pastel.
 *
 * Every class is spelled out in full rather than built from the tone name,
 * because Tailwind only ships classes it can see in the source.
 */
export const PASTEL_TONES = {
  mint: {
    chip: "bg-pastel-mint text-pastel-mint-ink",
    ink: "text-pastel-mint-ink",
    surface: "bg-pastel-mint/70 ring-pastel-mint-ink/15",
    link: "border-transparent bg-pastel-mint text-pastel-mint-ink hover:bg-pastel-mint/70 hover:text-pastel-mint-ink",
  },
  sky: {
    chip: "bg-pastel-sky text-pastel-sky-ink",
    ink: "text-pastel-sky-ink",
    surface: "bg-pastel-sky/70 ring-pastel-sky-ink/15",
    link: "border-transparent bg-pastel-sky text-pastel-sky-ink hover:bg-pastel-sky/70 hover:text-pastel-sky-ink",
  },
  lavender: {
    chip: "bg-pastel-lavender text-pastel-lavender-ink",
    ink: "text-pastel-lavender-ink",
    surface: "bg-pastel-lavender/70 ring-pastel-lavender-ink/15",
    link: "border-transparent bg-pastel-lavender text-pastel-lavender-ink hover:bg-pastel-lavender/70 hover:text-pastel-lavender-ink",
  },
  peach: {
    chip: "bg-pastel-peach text-pastel-peach-ink",
    ink: "text-pastel-peach-ink",
    surface: "bg-pastel-peach/70 ring-pastel-peach-ink/15",
    link: "border-transparent bg-pastel-peach text-pastel-peach-ink hover:bg-pastel-peach/70 hover:text-pastel-peach-ink",
  },
  rose: {
    chip: "bg-pastel-rose text-pastel-rose-ink",
    ink: "text-pastel-rose-ink",
    surface: "bg-pastel-rose/70 ring-pastel-rose-ink/15",
    link: "border-transparent bg-pastel-rose text-pastel-rose-ink hover:bg-pastel-rose/70 hover:text-pastel-rose-ink",
  },
  lemon: {
    chip: "bg-pastel-lemon text-pastel-lemon-ink",
    ink: "text-pastel-lemon-ink",
    surface: "bg-pastel-lemon/70 ring-pastel-lemon-ink/15",
    link: "border-transparent bg-pastel-lemon text-pastel-lemon-ink hover:bg-pastel-lemon/70 hover:text-pastel-lemon-ink",
  },
} as const;

export type PastelTone = keyof typeof PASTEL_TONES;
