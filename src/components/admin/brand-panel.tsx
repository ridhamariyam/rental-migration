/**
 * The right-hand panel on the admin sign-in screen. Purely decorative/brand
 * — an authored illustration (not a stock photo, not a lucide icon blown up
 * to hero scale), hidden below `md` so the sign-in form is what mobile
 * visitors see first.
 */
export function BrandPanel() {
  return (
    <div className="bg-primary relative hidden overflow-hidden md:flex md:flex-col md:justify-end">
      <svg
        viewBox="0 0 400 520"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* Atmosphere */}
        <circle cx="80" cy="90" r="150" fill="white" fillOpacity="0.06" />
        <circle cx="340" cy="60" r="110" fill="white" fillOpacity="0.05" />
        <circle cx="210" cy="480" r="230" fill="white" fillOpacity="0.05" />

        {/* Hanger */}
        <path
          d="M188 38 C188 24 212 24 212 38"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M200 38 L200 54 M200 54 L140 94 M200 54 L260 94"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Gown silhouette */}
        <path
          d="M140 94
             C150 148 158 188 168 224
             C150 298 95 358 68 458
             Q200 500 332 458
             C305 358 250 298 232 224
             C242 188 250 148 260 94
             Z"
          fill="white"
          fillOpacity="0.14"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Waist sash */}
        <path
          d="M170 226 Q200 236 230 226"
          fill="none"
          stroke="white"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Bodice buttons */}
        <circle cx="200" cy="112" r="2.5" fill="white" fillOpacity="0.6" />
        <circle cx="200" cy="132" r="2.5" fill="white" fillOpacity="0.6" />
        <circle cx="200" cy="152" r="2.5" fill="white" fillOpacity="0.6" />
      </svg>

      <p className="text-primary-foreground/90 relative z-10 px-10 pb-10 text-sm">
        Bridal rental operations, end to end — inventory, bookings, and payments
        in one place.
      </p>
    </div>
  );
}
