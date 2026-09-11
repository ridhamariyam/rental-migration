import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  BarcodeIcon,
  BuildingIcon,
  ShirtIcon,
  TagIcon,
} from "lucide-react";
import { ProductCreateForm } from "@/components/tenant/product-create-form";
import { ProductForm } from "@/components/tenant/product-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { outletScopeFor } from "@/server/auth/guard";
import { tenantPaths } from "@/lib/tenant-paths";
import { listAllCategories } from "@/server/categories/service";
import { listActiveOutletsForSelect } from "@/server/outlets/service";

export const metadata = {
  title: "Add Product — Rentique",
};

const nextSteps = [
  {
    icon: ShirtIcon,
    title: "Listing and first item together",
    description:
      "One submit creates the catalogue entry and its first physical copy — no second step before it can be rented.",
  },
  {
    icon: BarcodeIcon,
    title: "SKU and barcode generated",
    description:
      "The item gets its own SKU and barcode, ready to print and attach. Leave both blank unless you're matching a label you already have.",
  },
  {
    icon: TagIcon,
    title: "More copies any time",
    description:
      "Extra barcoded copies — other sizes, colours, or outlets — are added from the product's own page.",
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

  const canViewCost = hasPermission(user.role, Permission.PRODUCT_COST_VIEW);

  const [categories, allOutlets] = await Promise.all([
    listAllCategories(user.shopId),
    listActiveOutletsForSelect(user.shopId),
  ]);

  // An outlet-scoped actor (manager/staff) only ever stocks items at their
  // own outlet — the picker never offers another outlet's option, same rule
  // the product page's "+ Add item" follows.
  const scopedOutletId = outletScopeFor(user);
  const outlets = scopedOutletId
    ? allOutlets.filter((outlet) => outlet.id === scopedOutletId)
    : allOutlets;

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
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Product details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Without an active outlet there is nowhere to stock a
                physical item, so the form falls back to the catalogue row
                on its own — items get added from the product's page once an
                outlet exists. */}
            {outlets.length === 0 ? (
              <>
                <Alert>
                  <BuildingIcon />
                  <AlertDescription>
                    {scopedOutletId
                      ? "Your outlet is deactivated, so this product is created without a physical item for now."
                      : "Add an active outlet to stock physical items. This product is created as a catalogue entry for now — add its items from the product's page afterwards."}
                  </AlertDescription>
                </Alert>
                <ProductForm categories={categories} />
              </>
            ) : (
              <ProductCreateForm
                categories={categories}
                outlets={outlets}
                canViewCost={canViewCost}
              />
            )}
          </CardContent>
        </Card>

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
