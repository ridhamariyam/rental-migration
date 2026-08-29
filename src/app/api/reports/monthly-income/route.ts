import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { monthlyIncomeQuerySchema } from "@/lib/validation/reports";
import { getMonthlyIncome } from "@/server/reports/service";

/** Monthly income for a calendar year (doc §21 "Monthly income") —
 * defaults to the current year. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = monthlyIncomeQuerySchema.parse({
      year: searchParams.get("year") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
    });

    const result = await getMonthlyIncome(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
