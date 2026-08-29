export const REPORT_TYPES = [
  { value: "daily-income", label: "Daily income" },
  { value: "monthly-income", label: "Monthly income" },
  { value: "pending-returns", label: "Pending returns" },
  { value: "deposits-held", label: "Deposits held" },
  { value: "most-rented", label: "Most rented" },
  { value: "revenue-by-outlet", label: "Revenue by outlet" },
  { value: "staff-performance", label: "Staff performance" },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["value"];
