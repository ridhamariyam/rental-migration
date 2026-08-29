import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { calculateSalaryQuerySchema } from "@/lib/validation/salary";
import { calculateSalary } from "@/server/salary/service";

/** Previews a month's salary without persisting anything — self-viewable,
 * `calculateSalary()` itself enforces `SALARY_MANAGE` for anyone else's. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = calculateSalaryQuerySchema.parse({
      staffId: searchParams.get("staffId"),
      year: searchParams.get("year"),
      month: searchParams.get("month"),
    });

    const calculation = await calculateSalary(
      user,
      query.staffId,
      query.year,
      query.month,
    );

    return apiSuccess(calculation);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
