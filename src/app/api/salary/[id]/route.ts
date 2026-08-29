import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { salaryIdParamSchema, updateSalarySchema } from "@/lib/validation/salary";
import { deleteSalary, updateSalary } from "@/server/salary/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.SALARY_MANAGE);

    const { id } = salaryIdParamSchema.parse(await params);
    const body = updateSalarySchema.parse(await request.json());
    const salary = await updateSalary(user, id, body);

    return apiSuccess(salary, "Salary updated");
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.SALARY_MANAGE);

    const { id } = salaryIdParamSchema.parse(await params);
    await deleteSalary(user, id);

    return apiSuccess(null, "Salary configuration removed");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
