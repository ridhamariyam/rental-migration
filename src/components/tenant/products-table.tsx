import Link from "next/link";
import Image from "next/image";
import { ShirtIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
}: {
  shopId: string;
  query: ProductListQuery;
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
                    {product.image ? (
                      <Image
                        src={product.image}
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
                  <span className="group-hover:underline">{product.name}</span>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
