import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, InfoIcon, TagIcon } from "lucide-react";
import { ProductForm } from "@/components/tenant/product-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { listAllCategories } from "@/server/categories/service";
import { getProductById } from "@/server/products/service";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Edit Product — Rentique",
};

const aboutEditing = [
  {
    icon: InfoIcon,
    title: "Changes apply immediately",
    description: "Updates take effect as soon as you save.",
  },
  {
    icon: TagIcon,
    title: "Moving categories",
    description:
      "Recategorizing a product doesn't touch its existing physical items.",
  },
];

export default async function EditProductPage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.PRODUCT_MANAGE)) {
    redirect(tenantPaths.products);
  }

  const { id } = await params;
  const product = await getProductById(user.shopId, id);

  if (!product) {
    notFound();
  }

  const categories = await listAllCategories(user.shopId);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href={`${tenantPaths.products}/${product.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {product.name}
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Edit product</h1>
          <p className="text-muted-foreground text-sm">
            Update this listing&rsquo;s details.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Product details</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductForm product={product} categories={categories} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">About editing</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {aboutEditing.map((step) => (
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
