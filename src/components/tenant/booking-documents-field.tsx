"use client";

import { ConfirmActionButton } from "@/components/tenant/confirm-action-button";
import { useRef, useState } from "react";
import { CameraIcon, FileTextIcon, PaperclipIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError } from "@/lib/api-client";
import { MAX_BOOKING_DOCUMENTS } from "@/lib/validation/bookings";

export type BookingDocument = { url: string; name: string };

type UploadResponse = { url: string };

/**
 * Optional paperwork attached to a booking — an ID proof, a signed rental
 * agreement, a handover photo. Same two-step shape as `ImageUploadField`:
 * each file is uploaded to `POST /api/uploads/document` the moment it is
 * picked and the field's value becomes the returned URL, so a failed
 * booking save never strands a half-attached file and a failed upload
 * never blocks the rest of the form.
 */
export function BookingDocumentsField({
  value,
  onChange,
  disabled,
}: {
  value: BookingDocument[];
  onChange: (documents: BookingDocument[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = value.length >= MAX_BOOKING_DOCUMENTS;

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setError(null);

    // Anything past the cap is dropped here rather than uploaded and then
    // rejected by `createBookingSchema` — the file would be in the bucket
    // with nothing pointing at it.
    const room = MAX_BOOKING_DOCUMENTS - value.length;
    const accepted = files.slice(0, room);
    if (accepted.length < files.length) {
      setError(`At most ${MAX_BOOKING_DOCUMENTS} documents per booking.`);
    }

    setIsUploading(true);
    const uploaded: BookingDocument[] = [];

    try {
      for (const file of accepted) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/uploads/document", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => null)) as {
          success: boolean;
          message: string;
          data: UploadResponse | null;
        } | null;

        if (!response.ok || !payload?.success || !payload.data) {
          throw new ApiClientError(
            payload?.message ?? "Upload failed. Please try again.",
            response.status,
          );
        }

        uploaded.push({ url: payload.data.url, name: file.name.slice(0, 200) });
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiClientError
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
    } finally {
      // Whatever made it through is kept even if a later file failed —
      // re-picking the one that failed beats re-picking all of them.
      if (uploaded.length > 0) {
        onChange([...value, ...uploaded]);
      }
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {value.map((document, index) => (
            <li
              key={`${document.url}-${index}`}
              className="border-border/60 bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <FileTextIcon
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
              <a
                href={document.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {document.name}
              </a>
              {!disabled ? (
                <ConfirmActionButton
                  ariaLabel={`Remove ${document.name}`}
                  title="Remove this document?"
                  description={`"${document.name}" comes off this booking. The file itself stays uploaded, but the booking will no longer reference it.`}
                  onConfirm={() =>
                    onChange(value.filter((_, i) => i !== index))
                  }
                  icon={<XIcon className="size-3.5" />}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isUploading || atLimit}
              />
            }
          >
            {isUploading ? (
              <>
                <Spinner />
                Uploading…
              </>
            ) : (
              <>
                <PaperclipIcon />
                {value.length > 0 ? "Add another" : "Attach document"}
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
              <CameraIcon />
              Take photo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => inputRef.current?.click()}>
              <PaperclipIcon />
              Choose file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-muted-foreground text-xs">
          {atLimit
            ? `${MAX_BOOKING_DOCUMENTS} of ${MAX_BOOKING_DOCUMENTS} attached.`
            : "PDF, JPEG, PNG, or WebP — up to 10 MB each."}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
