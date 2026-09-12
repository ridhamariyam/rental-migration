"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, CalculatorIcon, ReceiptTextIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMinutes, formatMoney } from "@/lib/format";
import type { SalaryCalculation } from "@/server/salary/service";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const now = new Date();
const YEAR_OPTIONS = [now.getFullYear(), now.getFullYear() - 1];

export function CalculatePayslipCard({
  staffId,
  canGenerate,
  payReadiness = "ready",
}: {
  staffId: string;
  canGenerate: boolean;
  /** Whether pay can be calculated at all. Pressing Calculate without an
   * hourly rate can only ever return an error, so when it is missing this
   * card says so up front and points at the fix instead. */
  payReadiness?: "none" | "no_rate" | "ready";
}) {
  const router = useRouter();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calculation, setCalculation] = useState<SalaryCalculation | null>(
    null,
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCalculate() {
    setError(null);
    setCalculation(null);
    setIsCalculating(true);

    try {
      const result = await apiRequest<SalaryCalculation>(
        `/api/salary/calculate?staffId=${staffId}&year=${year}&month=${month}`,
      );
      setCalculation(result);
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);

    try {
      await apiRequest("/api/salary/payslips", {
        method: "POST",
        body: JSON.stringify({ staffId, year, month }),
      });
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalculatorIcon className="size-4" aria-hidden="true" />
          Calculate salary
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {payReadiness !== "ready" ? (
          <div className="border-border/60 bg-muted/40 flex flex-col gap-1 rounded-lg border p-4">
            <p className="text-sm font-medium">
              {payReadiness === "none"
                ? "No pay configured for this staff member yet"
                : "This staff member has no hourly rate yet"}
            </p>
            <p className="text-muted-foreground text-sm">
              {payReadiness === "none"
                ? "Add a pay configuration above — an hourly rate, the standard hours in a day, and the weekly off — then their salary can be calculated from the hours they actually worked."
                : "Their pay was configured before this shop moved to hourly pay. Edit the configuration above (or add a new one) and set an hourly rate; every payslip already generated keeps the figures it was priced at."}
            </p>
          </div>
        ) : null}

        {error ? (
          <Alert
            variant="destructive"
            className="border-destructive/25 bg-destructive/5"
          >
            <AlertCircleIcon />
            <AlertDescription className="text-destructive font-medium">
              {error}
            </AlertDescription>
          </Alert>
        ) : null}

        <div
          className="flex flex-wrap items-center gap-2"
          hidden={payReadiness !== "ready"}
        >
          <Select
            value={String(month)}
            onValueChange={(next) => setMonth(Number(next))}
          >
            <SelectTrigger className="w-36">
              <SelectValue>
                {(value: string) => MONTH_LABELS[Number(value) - 1]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, index) => (
                <SelectItem key={label} value={String(index + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(year)}
            onValueChange={(next) => setYear(Number(next))}
          >
            <SelectTrigger className="w-24">
              <SelectValue>{(value: string) => value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCalculate}
            disabled={isCalculating}
          >
            {isCalculating ? <Spinner /> : null}
            Calculate
          </Button>
        </div>

        {calculation ? (
          <>
            <Separator />

            {/* Laid out as the arithmetic actually runs: hours, then the
                rates they are paid at, then the two pay lines that make up
                the net — so the number at the bottom can be checked by
                reading upward. */}
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Regular hours</span>
                <span className="font-medium">
                  {formatMinutes(calculation.regularMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Extra / overtime hours
                </span>
                <span className="font-medium">
                  {formatMinutes(calculation.overtimeMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hourly rate</span>
                <span className="font-medium">
                  {formatMoney(calculation.hourlyRate)}/hr
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Extra worktime rate
                </span>
                <span className="font-medium">
                  {calculation.overtimeRatePerHour
                    ? `${formatMoney(calculation.overtimeRatePerHour)}/hr`
                    : "Not paid"}
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Base pay ({formatMinutes(calculation.regularMinutes)} ×{" "}
                  {formatMoney(calculation.hourlyRate)})
                </span>
                <span className="font-medium">
                  {formatMoney(calculation.basePay)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Overtime pay
                  {calculation.overtimeRatePerHour
                    ? ` (${formatMinutes(calculation.overtimeMinutes)} × ${formatMoney(calculation.overtimeRatePerHour)})`
                    : ""}
                </span>
                <span className="font-medium">
                  {formatMoney(calculation.overtimePay)}
                </span>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-base">
                <span className="font-semibold">Net payable</span>
                <span className="font-semibold">
                  {formatMoney(calculation.netAmount)}
                </span>
              </div>

              <Separator />

              {/* The attendance the figures above were read from. */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Working days ({calculation.standardHoursPerDay}h/day)
                </span>
                <span className="font-medium">{calculation.workingDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Present days</span>
                <span className="font-medium">{calculation.presentDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Approved leave days (paid)
                </span>
                <span className="font-medium">
                  {calculation.approvedLeaveDays}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Absent days</span>
                <span className="font-medium">{calculation.absentDays}</span>
              </div>
              {calculation.incompleteDays > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Incomplete (no checkout)
                  </span>
                  <span className="font-medium">
                    {calculation.incompleteDays}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Total hours worked
                </span>
                <span className="font-medium">
                  {formatMinutes(calculation.totalWorkedMinutes)}
                </span>
              </div>
              {calculation.payStart > calculation.periodStart ? (
                <p className="text-muted-foreground text-xs">
                  Paid from {calculation.payStart} — the days before it fall
                  outside this staff member&rsquo;s joining date or pay
                  configuration, and are not counted absent.
                </p>
              ) : null}
              {calculation.monthlySalary ? (
                <p className="text-muted-foreground text-xs">
                  Quoted at {formatMoney(calculation.monthlySalary)}/month for
                  reference — pay above is hours worked × hourly rate.
                </p>
              ) : null}
            </div>

            {canGenerate ? (
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? <Spinner /> : <ReceiptTextIcon />}
                Generate payslip
              </Button>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
