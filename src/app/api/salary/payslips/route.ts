import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  generatePayslipSchema,
  payslipListQuerySchema,
  resolvePayrollRange,
} from "@/lib/validation/salary";
import {
  generatePayslipForRange,
  listPayslips,
} from "@/server/salary/service";

/** Payslip history — not gated by a single fixed permission at the route
 * level, `listPayslips()` scopes the list to the caller's own payslips
 * unless they hold `SALARY_MANAGE`. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = payslipListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      staffId: searchParams.get("staffId") ?? undefined,
    });

    const result = await listPayslips(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

/** Persists a period's calculation as a stable payroll record — owner-only.
 * The period may be a month or an explicit date range. */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.SALARY_MANAGE);

    const body = generatePayslipSchema.parse(await request.json());
    const payslip = await generatePayslipForRange(
      user,
      body.staffId,
      resolvePayrollRange(body),
    );

    return apiSuccess(payslip, "Payslip generated", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
