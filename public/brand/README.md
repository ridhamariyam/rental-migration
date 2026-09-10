# Brand assets

## `loginpage.png` — the sign-in photograph

`AuthVisualPanel` (`src/components/auth/auth-visual-panel.tsx`) renders this
file as the right half of `/login` and `/admin/login`, framed slightly right
of centre so the rail of lehengas stays in shot on a tall panel.

It is loaded through `next/image`, so the ~2 MB PNG here is never what a
visitor downloads — Next serves a resized AVIF/WebP, and the `sizes` hint
means the phone layout (where the panel is not rendered) fetches nothing at
all. Replacing the photo therefore does not require optimising it first.

If you swap it, keep the same qualities:

- a boutique rail of bridal or occasion wear, embroidery/detailing visible
- warm natural light, shallow depth of field, neutral-warm palette
- editorial, not catalogue — no faces looking at camera, no office, no
  laptops, no generic SaaS or technology imagery
- a quiet lower third: the headline and feature list sit over it

Landscape, at least 1600px wide. Point `PHOTOGRAPH_URL` at the new filename.
Behind the photo sit authored gradient layers, so a missing file degrades to
a finished-looking warm backdrop rather than a blank rectangle.

**No logo.** This project has no logo, monogram or brand icon; the name is
set as type by `src/components/brand/wordmark.tsx`. Do not add one here.
