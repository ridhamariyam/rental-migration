import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  calculateSalaryQuerySchema,
  resolvePayrollRange,
} from "@/lib/validation/salary";
import { calculateSalaryForRange } from "@/server/salary/service";

/**
 * Previews a payroll period without persisting anything. The period is
 * either `from`/`to` dates or a `year`/`month` pair standing for that whole
 * calendar month — self-viewable, and the service itself enforces
 * `SALARY_MANAGE` for anyone else's figures.
 */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = calculateSalaryQuerySchema.parse({
      staffId: searchParams.get("staffId"),
      fromDate: searchParams.get("from") ?? undefined,
      toDate: searchParams.get("to") ?? undefined,
      year: searchParams.get("year") ?? undefined,
      month: searchParams.get("month") ?? undefined,
    });

    const calculation = await calculateSalaryForRange(
      user,
      query.staffId,
      resolvePayrollRange(query),
    );

    return apiSuccess(calculation);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
