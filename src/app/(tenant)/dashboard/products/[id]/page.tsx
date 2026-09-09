import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  PencilIcon,
  ShirtIcon,
  TagIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProductStatusAction } from "@/components/tenant/product-status-action";
import { VariationsCard } from "@/components/tenant/variations-card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate } from "@/lib/format";
import { getProductById } from "@/server/products/service";
import { listActiveOutletsForSelect } from "@/server/outlets/service";
import { listVariationsForProduct } from "@/server/variations/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const product = user?.shopId ? await getProductById(user.shopId, id) : null;

  return {
    title: product
      ? `${product.name} — Rentique`
      : "Product not found — Rentique",
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.PRODUCT_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.PRODUCT_MANAGE);
  const canViewCost = hasPermission(user.role, Permission.PRODUCT_COST_VIEW);
  const { id } = await params;
  const { created } = await searchParams;
  const product = await getProductById(user.shopId, id);

  if (!product) {
    notFound();
  }

  const [rawVariations, allOutlets] = await Promise.all([
    listVariationsForProduct(user.shopId, product.id),
    listActiveOutletsForSelect(user.shopId),
  ]);

  // Defense in depth on top of the form-level gate — a non-admin actor
  // never receives the buying price in the rendered payload at all.
  const variations = canViewCost
    ? rawVariations
    : rawVariations.map((variation) => ({ ...variation, buyingPrice: null }));

  // An outlet-scoped actor (manager/staff) only ever adds/edits items at
  // their own outlet — the picker never offers another outlet's option.
  const outlets = user.outletId
    ? allOutlets.filter((outlet) => outlet.id === user.outletId)
    : allOutlets;

  const fields = [
    { label: "Category", value: product.categoryName, icon: TagIcon },
    {
      label: "Description",
      value: product.description || "—",
      icon: ShirtIcon,
    },
    {
      label: "Physical items",
      value: String(product.variationCount),
      icon: ShirtIcon,
    },
  ];

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={tenantPaths.products}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Products
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">
              Product created successfully.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-md">
              {product.coverImage ? (
                <Image
                  src={product.coverImage}
                  alt=""
                  width={64}
                  height={64}
                  className="size-full object-cover"
                  unoptimized
                />
              ) : (
                <ShirtIcon className="text-muted-foreground size-6" />
              )}
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{product.categoryName}</Badge>
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
              </div>
              <span className="text-muted-foreground text-xs">
                Added {formatDate(product.createdAt, "long")}
              </span>
            </div>
          </div>

          {canManage ? (
            <Button
              variant="accent"
              nativeButton={false}
              render={
                <Link href={`${tenantPaths.products}/${product.id}/edit`} />
              }
            >
              <PencilIcon />
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Product details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {fields.map((field) => (
                <div
                  key={field.label}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <field.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="text-muted-foreground text-sm">
                      {field.label}
                    </p>
                    <p className="truncate text-sm font-medium sm:text-right">
                      {field.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${product.isActive ? "bg-primary/10" : "bg-muted"}`}
              >
                <span
                  className={`size-2.5 rounded-full ${product.isActive ? "bg-primary" : "bg-muted-foreground/40"}`}
                />
              </span>
              <div className="flex flex-col">
                <p className="text-sm font-medium">
                  {product.isActive ? "Active" : "Inactive"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {product.isActive
                    ? "Visible to staff for booking"
                    : "Hidden from staff"}
                </p>
              </div>
            </div>

            {canManage ? (
              <>
                <Separator />
                <ProductStatusAction
                  productId={product.id}
                  isActive={product.isActive}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <VariationsCard
        productId={product.id}
        productName={product.name}
        variations={variations}
        outlets={outlets}
        canManage={canManage}
        canViewCost={canViewCost}
      />
    </main>
  );
}
