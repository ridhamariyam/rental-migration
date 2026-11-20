import { requireTenantUser } from "@/server/auth/guard";
import { AppError } from "@/lib/errors/app-error";
import { apiError } from "@/lib/errors/api-response";
import { REPORT_TYPES, type ReportType } from "@/lib/report-types";
import { buildReportTable, reportFileName, toCsv } from "@/server/reports/export";

const REPORT_VALUES = REPORT_TYPES.map((type) => type.value) as readonly string[];

/** Any report as a CSV download (opens in Excel/Sheets), with the same
 * filters as on screen. Access and outlet scoping are the report
 * services' own (`requireReportAccess`), exactly as for the JSON routes. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();
    const { searchParams } = new URL(request.url);

    const report = searchParams.get("report") ?? "";
    if (!REPORT_VALUES.includes(report)) {
      throw new AppError("Unknown report", 400);
    }

    const params = {
      fromDate: searchParams.get("fromDate") || undefined,
      toDate: searchParams.get("toDate") || undefined,
      year: searchParams.get("year") || undefined,
      outletId: searchParams.get("outletId") || undefined,
    };

    const table = await buildReportTable(user, report as ReportType, params);
    const fileName = reportFileName(report as ReportType, params);

    return new Response(toCsv(table), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
