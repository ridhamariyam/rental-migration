"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryFormDialog } from "@/components/tenant/category-form-dialog";

export function AddCategoryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        Add category
      </Button>
      <CategoryFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
