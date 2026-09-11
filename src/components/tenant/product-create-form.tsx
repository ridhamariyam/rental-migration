"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PlusIcon, ShirtIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { CategoryFormDialog } from "@/components/tenant/category-form-dialog";
import {
  CustomerPicker,
  type PickedCustomer,
} from "@/components/tenant/customer-picker";
import { ImageUploadField } from "@/components/tenant/image-upload-field";
import { OutletMultiSelect } from "@/components/tenant/outlet-multi-select";
import {
  createProductWithItemSchema,
  type CreateProductWithItemInput,
} from "@/lib/validation/products";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ProductRow } from "@/server/products/service";
import type { CategoryRow } from "@/server/categories/service";

/** Sentinel `SelectItem` value for the inline "+ Add category" row — never
 * a real category id, so it's safe to check for before it ever reaches
 * `field.onChange`. */
const ADD_CATEGORY_VALUE = "__add_category__";

/** Server-side field errors are only re-attached to inputs that actually
 * exist on this form; anything else falls through to the form-level alert
 * rather than being silently swallowed. The `item.`-prefixed names match
 * what `createProductWithItem` namespaces its item errors as. */
const MAPPABLE_FIELDS = [
  "name",
  "categoryId",
  "description",
  "item.color",
  "item.size",
  "item.rentPrice",
  "item.sellingPrice",
  "item.buyingPrice",
  "item.securityDeposit",
  "item.quantity",
  "item.outletIds",
  "item.sku",
  "item.barcode",
  "item.ownerName",
  "item.ownerPhone",
  "item.ownerShareAmount",
  "item.ownerNotes",
] as const satisfies readonly FieldPath<CreateProductWithItemInput>[];

function isMappableField(
  field: string,
): field is (typeof MAPPABLE_FIELDS)[number] {
  return (MAPPABLE_FIELDS as readonly string[]).includes(field);
}

/**
 * "Add product" — the catalogue entry and its first barcoded item in a
 * single submit, posted as one request so a rejected item never leaves an
 * empty listing behind (see `createProductWithItem`). Adding a product used
 * to stop at the catalogue row and hand the owner a second, easy-to-forget
 * step on the product's own page before it could be rented at all.
 *
 * Editing stays split: `ProductForm` edits the catalogue fields, each item
 * is edited from its own row. Only *creation* was ever the two-step flow.
 * A shop with no active outlet has nowhere to stock an item, so that case
 * keeps using `ProductForm` instead of this component.
 */
export function ProductCreateForm({
  categories,
  outlets,
  canViewCost,
}: {
  categories: { id: string; name: string }[];
  outlets: { id: string; name: string; code: string }[];
  /** Gates the "Buying price" field — admin-only
   * (`Permission.PRODUCT_COST_VIEW`), unlike selling/rental price which
   * any `PRODUCT_MANAGE` role can see and set. */
  canViewCost: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pickedOwner, setPickedOwner] = useState<PickedCustomer | null>(null);
  // Categories added from the inline dialog are held here as well as being
  // picked up by that dialog's `router.refresh()` — the refreshed server
  // props land a beat later, and without the local copy the trigger would
  // briefly read "Choose a category" for the category just created.
  const [inlineCategories, setInlineCategories] = useState<
    { id: string; name: string }[]
  >([]);

  const categoryOptions = useMemo(() => {
    const merged = [...categories];
    for (const category of inlineCategories) {
      if (!merged.some((existing) => existing.id === category.id)) {
        merged.push(category);
      }
    }
    return merged;
  }, [categories, inlineCategories]);

  const form = useForm<CreateProductWithItemInput>({
    resolver: zodResolver(createProductWithItemSchema),
    defaultValues: {
      name: "",
      categoryId: categories[0]?.id ?? "",
      description: "",
      item: {
        color: "",
        size: "",
        rentPrice: "",
        buyingPrice: "",
        securityDeposit: "",
        sellingPrice: "",
        quantity: "1",
        outletIds: outlets[0] ? [outlets[0].id] : [],
        sku: "",
        barcode: "",
        image: "",
        ownershipType: "shop_owned",
        ownerName: "",
        ownerPhone: "",
        ownerCustomerId: "",
        ownerShareAmount: "",
        ownerNotes: "",
      },
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const errors = form.formState.errors;
  const itemErrors = errors.item ?? {};
  const categoryPlaceholder =
    categoryOptions.length === 0
      ? "No categories yet — add one"
      : "Choose a category";

  const ownershipType = useWatch({
    control: form.control,
    name: "item.ownershipType",
  });
  const outletIds =
    useWatch({ control: form.control, name: "item.outletIds" }) ?? [];
  const multipleOutlets = outletIds.length > 1;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest<ProductRow>("/api/products", {
        method: "POST",
        body: JSON.stringify(values),
      });

      router.push(`${tenantPaths.products}?created=1`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (isMappableField(fieldError.field)) {
            form.setError(fieldError.field, { message: fieldError.message });
            mappedToField = true;
          }
        }
        if (mappedToField) {
          return;
        }
      }

      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError ? (
        <Alert
          variant="destructive"
          className="border-destructive/25 bg-destructive/5"
        >
          <AlertCircleIcon />
          <AlertDescription className="text-destructive font-medium">
            {formError}
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Product name</FieldLabel>
          <div className="relative">
            <ShirtIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            {/* Deliberately not autofocused, unlike the shorter forms in
                this app: blurring an autofocused-but-empty name is what
                `mode: "onTouched"` validates on, and the error line it
                inserts pushes everything under it down ~28px mid-click —
                so the very first click on a control below (the "New
                category" button especially) lands on empty space and is
                silently lost. */}
            <Input
              id="name"
              aria-invalid={!!errors.name}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("name", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={!!errors.categoryId}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor="categoryId">Category</FieldLabel>
            {/* The dropdown carries the same "+ Add category" row, but a
                shop adding its first products spends most of its time
                creating categories as it goes — worth a visible button
                rather than an option only found by opening the list. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-auto gap-1 px-2 py-1 text-xs"
              disabled={isSubmitting}
              onClick={() => setCategoryDialogOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              New category
            </Button>
          </div>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(next) => {
                  if (next === ADD_CATEGORY_VALUE) {
                    setCategoryDialogOpen(true);
                    return;
                  }
                  field.onChange(next);
                  setFormError(null);
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder={categoryPlaceholder}>
                    {(value: string) =>
                      categoryOptions.find((category) => category.id === value)
                        ?.name ?? categoryPlaceholder
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                  {categoryOptions.length > 0 ? <SelectSeparator /> : null}
                  <SelectItem value={ADD_CATEGORY_VALUE}>
                    <PlusIcon />
                    Add category
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.categoryId]} />
        </Field>

        <Field data-invalid={!!errors.description}>
          <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
          <Textarea
            id="description"
            rows={4}
            aria-invalid={!!errors.description}
            disabled={isSubmitting}
            {...form.register("description", {
              onChange: () => setFormError(null),
            })}
          />
          <FieldError errors={[errors.description]} />
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-1 border-t pt-6">
        <h2 className="text-sm font-semibold tracking-tight">Physical item</h2>
        <p className="text-muted-foreground text-sm">
          The first barcoded copy of this product — priced, stocked at an
          outlet, and bookable the moment it&rsquo;s created. Add more copies
          later from the product&rsquo;s page.
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="item-image">Item photo (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="item.image"
            render={({ field }) => (
              <ImageUploadField
                value={field.value ?? ""}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
            )}
          />
          {multipleOutlets ? (
            <p className="text-muted-foreground text-xs">
              Each outlet&rsquo;s copy starts with this photo — swap it later
              from that item&rsquo;s own Edit dialog.
            </p>
          ) : null}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!itemErrors.color}>
            <FieldLabel htmlFor="item-color">Color (optional)</FieldLabel>
            <Input
              id="item-color"
              disabled={isSubmitting}
              {...form.register("item.color")}
            />
            <FieldError errors={[itemErrors.color]} />
          </Field>

          <Field data-invalid={!!itemErrors.size}>
            <FieldLabel htmlFor="item-size">Size (optional)</FieldLabel>
            <Input
              id="item-size"
              disabled={isSubmitting}
              {...form.register("item.size")}
            />
            <FieldError errors={[itemErrors.size]} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!itemErrors.rentPrice}>
            <FieldLabel htmlFor="item-rentPrice">Rental price</FieldLabel>
            <Input
              id="item-rentPrice"
              inputMode="decimal"
              placeholder="0.00"
              disabled={isSubmitting}
              {...form.register("item.rentPrice")}
            />
            <FieldError errors={[itemErrors.rentPrice]} />
          </Field>

          <Field data-invalid={!!itemErrors.securityDeposit}>
            <FieldLabel htmlFor="item-securityDeposit">
              Default security deposit
            </FieldLabel>
            <Input
              id="item-securityDeposit"
              inputMode="decimal"
              placeholder="0.00"
              disabled={isSubmitting}
              {...form.register("item.securityDeposit")}
            />
            <FieldDescription>
              Held for each unit of this item unless a booking overrides it.
            </FieldDescription>
            <FieldError errors={[itemErrors.securityDeposit]} />
          </Field>

          <Field data-invalid={!!itemErrors.sellingPrice}>
            <FieldLabel htmlFor="item-sellingPrice">
              Selling price (optional)
            </FieldLabel>
            <Input
              id="item-sellingPrice"
              inputMode="decimal"
              placeholder="0.00"
              disabled={isSubmitting}
              {...form.register("item.sellingPrice")}
            />
            <FieldError errors={[itemErrors.sellingPrice]} />
          </Field>

          {canViewCost ? (
            <Field data-invalid={!!itemErrors.buyingPrice}>
              <FieldLabel htmlFor="item-buyingPrice">
                Buying price (optional)
              </FieldLabel>
              <Input
                id="item-buyingPrice"
                inputMode="decimal"
                placeholder="0.00"
                disabled={isSubmitting}
                {...form.register("item.buyingPrice")}
              />
              <FieldError errors={[itemErrors.buyingPrice]} />
            </Field>
          ) : null}

          <Field data-invalid={!!itemErrors.quantity}>
            <FieldLabel htmlFor="item-quantity">Quantity</FieldLabel>
            <Input
              id="item-quantity"
              inputMode="numeric"
              disabled={isSubmitting}
              {...form.register("item.quantity")}
            />
            <FieldError errors={[itemErrors.quantity]} />
          </Field>
        </div>

        <Field data-invalid={!!itemErrors.outletIds}>
          <FieldLabel htmlFor="item-outletIds">Outlets</FieldLabel>
          <Controller
            control={form.control}
            name="item.outletIds"
            render={({ field }) => (
              <OutletMultiSelect
                id="item-outletIds"
                outlets={outlets}
                value={field.value ?? []}
                onChange={(next) => {
                  field.onChange(next);
                  if (next.length > 1) {
                    // A manual sku/barcode only applies to one physical
                    // item — clear any leftover value the moment a second
                    // outlet is added, so a stale value can't silently fail
                    // the superRefine check at submit.
                    form.setValue("item.sku", "");
                    form.setValue("item.barcode", "");
                  }
                }}
                disabled={isSubmitting}
                invalid={!!itemErrors.outletIds}
              />
            )}
          />
          <FieldError errors={[itemErrors.outletIds]} />
          {multipleOutlets ? (
            <p className="text-muted-foreground text-xs">
              Adding to {outletIds.length} outlets creates {outletIds.length}{" "}
              separate barcoded items, one per outlet.
            </p>
          ) : null}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!itemErrors.sku}>
            <FieldLabel htmlFor="item-sku">SKU (optional)</FieldLabel>
            <Input
              id="item-sku"
              placeholder={
                multipleOutlets
                  ? "Auto-generated for each outlet"
                  : "Auto-generated if left blank"
              }
              disabled={isSubmitting || multipleOutlets}
              {...form.register("item.sku")}
            />
            <FieldError errors={[itemErrors.sku]} />
          </Field>

          <Field data-invalid={!!itemErrors.barcode}>
            <FieldLabel htmlFor="item-barcode">Barcode (optional)</FieldLabel>
            <Input
              id="item-barcode"
              placeholder={
                multipleOutlets
                  ? "Auto-generated for each outlet"
                  : "Auto-generated if left blank"
              }
              disabled={isSubmitting || multipleOutlets}
              {...form.register("item.barcode")}
            />
            <FieldError errors={[itemErrors.barcode]} />
          </Field>
        </div>

        <div className="flex flex-col gap-4 border-t pt-4">
          <Field data-invalid={!!itemErrors.ownershipType}>
            <FieldLabel htmlFor="item-ownershipType">Ownership</FieldLabel>
            <Controller
              control={form.control}
              name="item.ownershipType"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="item-ownershipType" className="w-full">
                    <SelectValue placeholder="Ownership">
                      {(value: string) =>
                        value === "customer_owned"
                          ? "Customer-owned (revenue share)"
                          : "Shop-owned"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="shop_owned">Shop-owned</SelectItem>
                    <SelectItem value="customer_owned">
                      Customer-owned (revenue share)
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[itemErrors.ownershipType]} />
          </Field>

          {ownershipType === "customer_owned" ? (
            <>
              <Field>
                <FieldLabel>Link to an existing customer (optional)</FieldLabel>
                <CustomerPicker
                  value={pickedOwner}
                  disabled={isSubmitting}
                  onSelect={(customer) => {
                    setPickedOwner(customer);
                    form.setValue("item.ownerCustomerId", customer?.id ?? "");
                    if (customer) {
                      form.setValue(
                        "item.ownerName",
                        `${customer.firstName} ${customer.lastName}`,
                      );
                      form.setValue("item.ownerPhone", customer.phone);
                    }
                  }}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!itemErrors.ownerName}>
                  <FieldLabel htmlFor="item-ownerName">Owner name</FieldLabel>
                  <Input
                    id="item-ownerName"
                    disabled={isSubmitting}
                    {...form.register("item.ownerName")}
                  />
                  <FieldError errors={[itemErrors.ownerName]} />
                </Field>
                <Field data-invalid={!!itemErrors.ownerPhone}>
                  <FieldLabel htmlFor="item-ownerPhone">
                    Owner phone (optional)
                  </FieldLabel>
                  <Input
                    id="item-ownerPhone"
                    disabled={isSubmitting}
                    {...form.register("item.ownerPhone")}
                  />
                  <FieldError errors={[itemErrors.ownerPhone]} />
                </Field>
              </div>

              <Field data-invalid={!!itemErrors.ownerShareAmount}>
                <FieldLabel htmlFor="item-ownerShareAmount">
                  Owner&rsquo;s revenue share
                </FieldLabel>
                <Input
                  id="item-ownerShareAmount"
                  inputMode="decimal"
                  placeholder="e.g. 500.00"
                  disabled={isSubmitting}
                  {...form.register("item.ownerShareAmount")}
                />
                <FieldError errors={[itemErrors.ownerShareAmount]} />
              </Field>

              <Field data-invalid={!!itemErrors.ownerNotes}>
                <FieldLabel htmlFor="item-ownerNotes">
                  Notes (optional)
                </FieldLabel>
                <Textarea
                  id="item-ownerNotes"
                  rows={2}
                  disabled={isSubmitting}
                  {...form.register("item.ownerNotes")}
                />
                <FieldError errors={[itemErrors.ownerNotes]} />
              </Field>
            </>
          ) : null}
        </div>
      </FieldGroup>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(tenantPaths.products)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-32">
          {isSubmitting ? (
            <>
              <Spinner />
              Creating…
            </>
          ) : (
            "Create product"
          )}
        </Button>
      </div>

      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onSuccess={(category: CategoryRow) => {
          setInlineCategories((current) => [...current, category]);
          form.setValue("categoryId", category.id, { shouldValidate: true });
          setFormError(null);
        }}
      />
    </form>
  );
}
