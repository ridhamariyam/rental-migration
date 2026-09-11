import { TagIcon } from "lucide-react";
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
import { CategoryRowActions } from "@/components/tenant/category-row-actions";
import {
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import type { CategoryListQuery } from "@/lib/validation/categories";
import { listCategories } from "@/server/categories/service";

function categoriesHref(query: CategoryListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.categories}${search ? `?${search}` : ""}`;
}

export async function CategoriesTable({
  shopId,
  query,
}: {
  shopId: string;
  query: CategoryListQuery;
}) {
  const { items, total, page, totalPages } = await listCategories(
    shopId,
    query,
  );
  const hasFilters = Boolean(query.q);

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TagIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters
              ? "No categories match your search"
              : "No categories yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term."
              : "Add a category to start organizing your product catalogue."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {/* No View button here, unlike the other lists: a category has no
          page of its own — its row menu (edit/delete) is the whole of what
          it can do. */}
      <ListCards>
        {items.map((category) => (
          <ListCardRow
            key={category.id}
            title={category.name}
            meta={
              <>
                {category.productCount} product
                {category.productCount === 1 ? "" : "s"}
                {category.description ? ` · ${category.description}` : ""}
              </>
            }
            action={<CategoryRowActions category={category} />}
          />
        ))}
      </ListCards>

      <TableOnly>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Name
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Description
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Products
              </TableHead>
              <TableHead className="w-12 px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="px-4 py-3 font-medium">
                  {category.name}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-sm truncate px-4 py-3 text-sm">
                  {category.description || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {category.productCount}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <CategoryRowActions category={category} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableOnly>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} categor{total === 1 ? "y" : "ies"} · page {page} of{" "}
          {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={categoriesHref(query, Math.max(1, page - 1))}
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
                    href={categoriesHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={categoriesHref(query, Math.min(totalPages, page + 1))}
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
