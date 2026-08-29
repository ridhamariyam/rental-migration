import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { customerStatusSchema } from "@/lib/validation/customers";
import { setCustomerStatus } from "@/server/customers/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.CUSTOMER_MANAGE);

    const { id } = await params;
    const body = customerStatusSchema.parse(await request.json());
    const customer = await setCustomerStatus(user.shopId, id, body.isActive);

    return apiSuccess(
      customer,
      body.isActive ? "Customer restored" : "Customer archived",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
