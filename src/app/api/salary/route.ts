import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { AppError } from "@/lib/errors/app-error";
import { createSalarySchema } from "@/lib/validation/salary";
import { optionalUuidSchema } from "@/lib/validation/common";
import { createSalary, listStaffSalaries } from "@/server/salary/service";

/** Every configuration ever entered for one staff member — self-viewable,
 * `listStaffSalaries()` itself enforces `SALARY_MANAGE` for anyone else's. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const parsed = optionalUuidSchema.safeParse(
      searchParams.get("staffId") ?? undefined,
    );
    const staffId = parsed.success ? parsed.data : undefined;

    if (!staffId) {
      throw new AppError("A staffId is required", 400, [
        { field: "staffId", message: "A staffId is required" },
      ]);
    }

    const salaries = await listStaffSalaries(user, staffId);
    return apiSuccess(salaries);
  } catch (error) {
    return apiError(error);
  }
}

/** Configures pay for a staff member (doc §18) — owner-only. */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.SALARY_MANAGE);

    const body = createSalarySchema.parse(await request.json());
    const salary = await createSalary(user, body);

    return apiSuccess(salary, "Salary configured", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
