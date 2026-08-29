/**
 * A practical (not exhaustive) list of countries for the phone country-code
 * picker — common markets for this platform plus major regions, rather than
 * all ~195 countries. India is first/default since the seeded/example data
 * and the platform's initial market are Indian bridal-rental businesses.
 */
export type Country = {
  iso2: string;
  name: string;
  dialCode: string;
};

export const countries: Country[] = [
  { iso2: "IN", name: "India", dialCode: "+91" },
  { iso2: "US", name: "United States", dialCode: "+1" },
  { iso2: "CA", name: "Canada", dialCode: "+1" },
  { iso2: "GB", name: "United Kingdom", dialCode: "+44" },
  { iso2: "AE", name: "United Arab Emirates", dialCode: "+971" },
  { iso2: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { iso2: "QA", name: "Qatar", dialCode: "+974" },
  { iso2: "KW", name: "Kuwait", dialCode: "+965" },
  { iso2: "OM", name: "Oman", dialCode: "+968" },
  { iso2: "BH", name: "Bahrain", dialCode: "+973" },
  { iso2: "PK", name: "Pakistan", dialCode: "+92" },
  { iso2: "BD", name: "Bangladesh", dialCode: "+880" },
  { iso2: "NP", name: "Nepal", dialCode: "+977" },
  { iso2: "LK", name: "Sri Lanka", dialCode: "+94" },
  { iso2: "SG", name: "Singapore", dialCode: "+65" },
  { iso2: "MY", name: "Malaysia", dialCode: "+60" },
  { iso2: "ID", name: "Indonesia", dialCode: "+62" },
  { iso2: "TH", name: "Thailand", dialCode: "+66" },
  { iso2: "PH", name: "Philippines", dialCode: "+63" },
  { iso2: "VN", name: "Vietnam", dialCode: "+84" },
  { iso2: "CN", name: "China", dialCode: "+86" },
  { iso2: "JP", name: "Japan", dialCode: "+81" },
  { iso2: "KR", name: "South Korea", dialCode: "+82" },
  { iso2: "AU", name: "Australia", dialCode: "+61" },
  { iso2: "NZ", name: "New Zealand", dialCode: "+64" },
  { iso2: "DE", name: "Germany", dialCode: "+49" },
  { iso2: "FR", name: "France", dialCode: "+33" },
  { iso2: "IT", name: "Italy", dialCode: "+39" },
  { iso2: "ES", name: "Spain", dialCode: "+34" },
  { iso2: "NL", name: "Netherlands", dialCode: "+31" },
  { iso2: "ZA", name: "South Africa", dialCode: "+27" },
  { iso2: "NG", name: "Nigeria", dialCode: "+234" },
  { iso2: "KE", name: "Kenya", dialCode: "+254" },
  { iso2: "BR", name: "Brazil", dialCode: "+55" },
  { iso2: "MX", name: "Mexico", dialCode: "+52" },
];

/** ISO 3166-1 alpha-2 → Unicode flag emoji, via the regional-indicator
 * symbol trick (each letter maps to U+1F1E6..U+1F1FF for A..Z). No image
 * assets needed. */
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
