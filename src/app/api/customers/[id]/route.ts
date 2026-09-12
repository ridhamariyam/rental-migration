import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { customerFormSchema } from "@/lib/validation/customers";
import {
  deleteCustomer,
  getCustomerById,
  updateCustomer,
} from "@/server/customers/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.CUSTOMER_VIEW);

    const { id } = await params;
    const customer = await getCustomerById(user.shopId, id);
    if (!customer) {
      throw AppError.notFound("Customer not found");
    }

    return apiSuccess(customer);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.CUSTOMER_MANAGE);

    const { id } = await params;
    const body = customerFormSchema.parse(await request.json());
    const customer = await updateCustomer(user.shopId, id, body);

    return apiSuccess(customer, "Customer updated");
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Permanent removal, owner-only (`Permission.RECORD_DELETE`). The service
 * decides whether this particular row may go — it refuses whenever
 * deleting would strand history that something else still depends on.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.RECORD_DELETE);

    const { id } = await params;
    await deleteCustomer(user, id);

    return apiSuccess(null, "Customer deleted");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
