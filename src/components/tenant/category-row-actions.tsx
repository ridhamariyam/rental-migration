"use client";

import { useState } from "react";
import { MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryFormDialog } from "@/components/tenant/category-form-dialog";
import { CategoryDeleteDialog } from "@/components/tenant/category-delete-dialog";
import type { CategoryRow } from "@/server/categories/service";

export function CategoryRowActions({ category }: { category: CategoryRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${category.name}`}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <TrashIcon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
