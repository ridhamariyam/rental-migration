"use client";

import { useState } from "react";
import { PencilIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryFormDialog } from "@/components/tenant/category-form-dialog";
import { CategoryDeleteDialog } from "@/components/tenant/category-delete-dialog";
import type { CategoryRow } from "@/server/categories/service";

export function CategoryRowActions({ category }: { category: CategoryRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      {/* Always-visible actions — a "⋯" menu hid these from clients. */}
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          aria-label={`Edit ${category.name}`}
        >
          <PencilIcon />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label={`Delete ${category.name}`}
        >
          <TrashIcon />
          Delete
        </Button>
      </div>

      <CategoryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        category={category}
      />
      <CategoryDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        category={category}
      />
    </>
  );
}
