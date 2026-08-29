"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PlayIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  avatarGradient,
  initialsFor,
  staffAvatarSrc,
} from "@/lib/tenant-avatar";
import {
  startMaintenanceTaskSchema,
  type StartMaintenanceTaskInput,
} from "@/lib/validation/maintenance";

export function StartMaintenanceTaskDialog({
  taskId,
  staffOptions,
}: {
  taskId: string;
  staffOptions: { id: string; firstName: string; lastName: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<StartMaintenanceTaskInput>({
    resolver: zodResolver(startMaintenanceTaskSchema),
    defaultValues: { assignedToId: "" },
  });

  const staffLabels: Record<string, string> = {
    "": "Myself",
    ...Object.fromEntries(
      staffOptions.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]),
    ),
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/maintenance/${taskId}/start`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          form.reset();
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlayIcon />
        Start task
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Start this task</DialogTitle>
          <DialogDescription>
            Marks it in progress and moves the item&rsquo;s own status
            accordingly.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
        >
          <DialogBody>
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

            <Field>
              <FieldLabel>Assign to</FieldLabel>
              <Controller
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <Select
                    value={field.value || ""}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Myself">
                        {(value: string) => {
                          const name = staffLabels[value];
                          if (!name || value === "") return name ?? "Myself";
                          return (
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar className="size-5 shrink-0">
                                <AvatarImage
                                  src={staffAvatarSrc(name)}
                                  alt={name}
                                />
                                <AvatarFallback
                                  className="!text-white text-[10px] font-semibold"
                                  style={{
                                    backgroundImage: avatarGradient(name),
                                  }}
                                >
                                  {initialsFor(name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">{name}</span>
                            </span>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectItem value="">Myself</SelectItem>
                      {staffOptions.map((staffMember) => {
                        const name = `${staffMember.firstName} ${staffMember.lastName}`.trim();
                        return (
                          <SelectItem key={staffMember.id} value={staffMember.id}>
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar className="size-5 shrink-0">
                                <AvatarImage
                                  src={staffAvatarSrc(name)}
                                  alt={name}
                                />
                                <AvatarFallback
                                  className="!text-white text-[10px] font-semibold"
                                  style={{
                                    backgroundImage: avatarGradient(name),
                                  }}
                                >
                                  {initialsFor(name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate">{name}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-28"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Starting…
                </>
              ) : (
                "Start task"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
