import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  customerFormSchema,
  customerListQuerySchema,
} from "@/lib/validation/customers";
import { createCustomer, listCustomers } from "@/server/customers/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.CUSTOMER_VIEW);

    const { searchParams } = new URL(request.url);
    const query = customerListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const result = await listCustomers(user.shopId, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.CUSTOMER_MANAGE);

    const body = customerFormSchema.parse(await request.json());
    const customer = await createCustomer(user.shopId, body);

    return apiSuccess(customer, "Customer created", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
