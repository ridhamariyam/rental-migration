import Link from "next/link";
import Image from "next/image";
import { EyeIcon, ShirtIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatMoney } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listOwnerItems } from "@/server/settlements/service";

/**
 * The register of items the shop is renting out on someone else's behalf.
 *
 * Sits above the settlement ledger because it answers the prior question:
 * a payout row only appears once a rental has been *returned*, so without
 * this the page had nothing to say about an owner's item that was listed,
 * or booked, or out with a customer right now.
 */
export async function OwnerItemsCard({
  actor,
  outletId,
  q,
}: {
  actor: TenantSessionUser;
  outletId?: string;
  q?: string;
}) {
  const items = await listOwnerItems(actor, { outletId, q });

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4" aria-hidden="true" />
            Customer-owned items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>No customer-owned items yet</EmptyTitle>
              <EmptyDescription>
                Add a physical item and set its ownership to
                &ldquo;Customer-owned&rdquo; with a revenue share — it will
                appear here, and its owner gets a WhatsApp message whenever it
                is booked.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-4" aria-hidden="true" />
          Customer-owned items
          <Badge variant="outline" className="text-muted-foreground">
            {items.length}
          </Badge>
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Listed on behalf of their owner. Each rental adds the owner&rsquo;s
          share to the ledger below once the item comes back.
        </p>
      </CardHeader>

      <CardContent className="p-0">
        <ListCards at="lg" className="border-t">
          {items.map((item) => (
            <ListCardRow
              key={item.variationId}
              media={
                <span className="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt=""
                      width={40}
                      height={40}
                      className="size-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <ShirtIcon className="text-muted-foreground size-4" />
                  )}
                </span>
              }
              title={item.productName}
              badge={
                <Badge
                  variant="secondary"
                  className="shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  {formatMoney(item.shareAmount)}/rental
                </Badge>
              }
              meta={
                <>
                  {item.ownerCustomerName ?? item.ownerName ?? "Unnamed owner"}
                  {" · "}
                  {item.timesRented} rental
                  {item.timesRented === 1 ? "" : "s"}
                  {" · "}
                  {formatMoney(item.pendingTotal)} pending · {item.sku}
                </>
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`${tenantPaths.products}/${item.productId}`} />
                  }
                >
                  <EyeIcon />
                  View
                </Button>
              }
            />
          ))}
        </ListCards>

        <TableOnly at="lg">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Item
                </TableHead>
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Owner
                </TableHead>
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Outlet
                </TableHead>
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Share / rental
                </TableHead>
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Rentals
                </TableHead>
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Owed / paid
                </TableHead>
                <TableHead className="h-11 px-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.variationId}>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt=""
                            width={36}
                            height={36}
                            className="size-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <ShirtIcon className="text-muted-foreground size-4" />
                        )}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {item.productName}
                          {item.color || item.size
                            ? ` (${[item.color, item.size].filter(Boolean).join(", ")})`
                            : ""}
                        </span>
                        <span className="text-muted-foreground/80 font-mono text-[11px]">
                          {item.sku}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm">
                    <div className="flex flex-col">
                      {item.ownerCustomerId ? (
                        <Link
                          href={`${tenantPaths.customers}/${item.ownerCustomerId}`}
                          className="font-medium hover:underline"
                        >
                          {item.ownerCustomerName}
                        </Link>
                      ) : (
                        <span className="font-medium">
                          {item.ownerName ?? "Unnamed owner"}
                        </span>
                      )}
                      {item.ownerPhone ? (
                        <span className="text-muted-foreground text-xs">
                          {item.ownerPhone}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                    {item.outletName ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm font-medium">
                    {formatMoney(item.shareAmount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                    {item.timesRented}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm">
                    <span className="font-medium">
                      {formatMoney(item.pendingTotal)}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      / {formatMoney(item.paidTotal)}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link
                          href={`${tenantPaths.products}/${item.productId}`}
                        />
                      }
                    >
                      <EyeIcon />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableOnly>
      </CardContent>
    </Card>
  );
}
