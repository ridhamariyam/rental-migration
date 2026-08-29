import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, BarcodeIcon, ShirtIcon, TagIcon } from "lucide-react";
import { ProductForm } from "@/components/tenant/product-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { listAllCategories } from "@/server/categories/service";

export const metadata = {
  title: "Add Product — Rentique",
};

const nextSteps = [
  {
    icon: ShirtIcon,
    title: "Catalogue entry, not stock",
    description:
      "This is the listing itself — add its barcoded physical items next, from the product's page.",
  },
  {
    icon: BarcodeIcon,
    title: "SKU and barcode per item",
    description:
      "Each physical copy gets its own generated SKU and barcode, ready to print and attach.",
  },
  {
    icon: TagIcon,
    title: "Organized by category",
    description:
      "Categories make products easier to browse and filter — manage them from the Categories page.",
  },
];

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.PRODUCT_MANAGE)) {
    redirect(tenantPaths.products);
  }

  const categories = await listAllCategories(user.shopId);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={tenantPaths.products}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Products
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Add product</h1>
          <p className="text-muted-foreground text-sm">
            Add a new listing to your rental catalogue.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {categories.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              <Empty className="py-20">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TagIcon />
                  </EmptyMedia>
                  <EmptyTitle>Add a category first</EmptyTitle>
                  <EmptyDescription>
                    Every product belongs to a category — create one before
                    adding your first product.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    nativeButton={false}
                    render={<Link href={tenantPaths.categories} />}
                  >
                    Add category
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Product details</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm categories={categories} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What happens next</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {nextSteps.map((step) => (
              <div key={step.title} className="flex items-start gap-3">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                  <step.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
