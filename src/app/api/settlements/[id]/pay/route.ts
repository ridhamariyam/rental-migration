import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { markSettlementPaidSchema } from "@/lib/validation/settlements";
import { markSettlementPaid } from "@/server/settlements/service";

/** Confirms a payout to the owner (doc §19–21) — `SETTLEMENT_MANAGE`
 * enforced inside `markSettlementPaid()` itself. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = markSettlementPaidSchema.parse(
      await request.json().catch(() => ({})),
    );
    const settlement = await markSettlementPaid(user, id, body);

    return apiSuccess(settlement, "Settlement marked as paid");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
