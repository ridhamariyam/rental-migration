import Link from "next/link";
import Image from "next/image";
import { EyeIcon, ShirtIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteRecordButton } from "@/components/tenant/delete-record-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import type { ProductListQuery } from "@/lib/validation/products";
import { listProducts } from "@/server/products/service";

function productsHref(query: ProductListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.status !== "all") params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.products}${search ? `?${search}` : ""}`;
}

export async function ProductsTable({
  shopId,
  query,
  canDelete = false,
}: {
  shopId: string;
  query: ProductListQuery;
  /** Owner-only (`Permission.RECORD_DELETE`) — the row's delete control is
   * not rendered at all for anyone else. */
  canDelete?: boolean;
}) {
  const { items, total, page, totalPages } = await listProducts(shopId, query);
  const hasFilters =
    Boolean(query.q) || Boolean(query.categoryId) || query.status !== "all";

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShirtIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No products match your filters" : "No products yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear the category/status filters."
              : "Add your first product to start building your rental catalogue."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {/* Phone: a stacked list rather than the table below it. A five-column
          table can only fit a ~390px screen by scrolling sideways, which
          hides the columns that say whether a product is usable (items,
          status) behind a gesture nothing on the page hints at. */}
      <ul className="divide-border/40 divide-y sm:hidden">
        {items.map((product) => (
          <li key={product.id} className="flex items-center gap-3 p-4">
            <span className="bg-muted flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
              {product.coverImage ? (
                <Image
                  src={product.coverImage}
                  alt=""
                  width={44}
                  height={44}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <ShirtIcon className="text-muted-foreground size-5" />
              )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* The name gets the row to itself — sharing the line with the
                  status badge clipped it to a few characters on a 390px
                  screen, which is the one thing the row has to be able to
                  say. */}
              <Link
                href={`${tenantPaths.products}/${product.id}`}
                className="truncate text-sm font-medium"
              >
                {product.name}
              </Link>
              <div className="flex min-w-0 items-center gap-2">
                {product.isActive ? (
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary shrink-0"
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground shrink-0"
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    Inactive
                  </Badge>
                )}
                {/* Count first, category second: when the line has to
                    truncate it's the category that gets clipped, not the
                    number that says whether this product has any stock. */}
                <span className="text-muted-foreground truncate text-xs">
                  {product.variationCount} item
                  {product.variationCount === 1 ? "" : "s"} ·{" "}
                  {product.categoryName}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`${tenantPaths.products}/${product.id}`} />}
              >
                <EyeIcon />
                View
              </Button>
              {canDelete ? (
                <DeleteRecordButton
                  endpoint={`/api/products/${product.id}`}
                  title={`Delete "${product.name}"?`}
                  description="The listing and its physical items are removed for good. Products that appear on past bookings cannot be deleted — deactivate those instead."
                  confirmLabel="Delete product"
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Product
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Category
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Items
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
              <TableHead className="h-11 px-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="px-4 py-3 font-medium">
                  <Link
                    href={`${tenantPaths.products}/${product.id}`}
                    className="group flex items-center gap-3"
                  >
                    <span className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                      {product.coverImage ? (
                        <Image
                          src={product.coverImage}
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
                    <span className="group-hover:underline">
                      {product.name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {product.categoryName}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {product.variationCount}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {product.isActive ? (
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-current" />
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link href={`${tenantPaths.products}/${product.id}`} />
                      }
                    >
                      <EyeIcon />
                      View
                    </Button>
                    {canDelete ? (
                      <DeleteRecordButton
                        endpoint={`/api/products/${product.id}`}
                        title={`Delete "${product.name}"?`}
                        description="The listing and its physical items are removed for good. Products that appear on past bookings cannot be deleted — deactivate those instead."
                        confirmLabel="Delete product"
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} product{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={productsHref(query, Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={
                  page <= 1 ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
            {paginationRange(page, totalPages).map((item, index) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={productsHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={productsHref(query, Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
                className={
                  page >= totalPages
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}
