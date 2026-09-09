/**
 * The right-hand panel on the admin sign-in screen. Purely decorative/brand
 * — an authored illustration (not a stock photo, not a lucide icon blown up
 * to hero scale), hidden below `md` so the sign-in form is what mobile
 * visitors see first.
 */
export function BrandPanel() {
  return (
    <div className="bg-primary relative hidden overflow-hidden md:flex md:flex-col md:justify-end">
  

      <p className="text-primary-foreground/90 relative z-10 px-10 pb-10 text-sm">
        Bridal rental operations, end to end — inventory, bookings, and payments
        in one place.
      </p>
    </div>
  );
}
