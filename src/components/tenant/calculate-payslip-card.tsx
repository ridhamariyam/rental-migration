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
}: {
  staffId: string;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calculation, setCalculation] = useState<SalaryCalculation | null>(null);
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

        <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Base salary</span>
                <span className="font-medium">
                  {formatMoney(calculation.baseSalary)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Working days</span>
                <span className="font-medium">{calculation.workingDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Present days</span>
                <span className="font-medium">{calculation.presentDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Approved leave days
                </span>
                <span className="font-medium">
                  {calculation.approvedLeaveDays}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Absent days</span>
                <span className="font-medium">{calculation.absentDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total hours worked</span>
                <span className="font-medium">
                  {formatMinutes(calculation.totalWorkedMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Average per day</span>
                <span className="font-medium">
                  {calculation.presentDays > 0
                    ? formatMinutes(calculation.averageMinutesPerDay)
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Per-day amount</span>
                <span className="font-medium">
                  {formatMoney(calculation.perDayAmount)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold">Net payable</span>
                <span className="font-semibold">
                  {formatMoney(calculation.netAmount)}
                </span>
              </div>
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
