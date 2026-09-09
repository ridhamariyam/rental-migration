"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CameraIcon, ImageIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError } from "@/lib/api-client";

type UploadResponse = { url: string };

/**
 * A single image upload field — separate from the surrounding form's own
 * submit (see `createVariationSchema`'s doc comment): picking a file
 * uploads it to `POST /api/uploads` immediately and the field's value
 * becomes the resulting URL string, so a failed *item* save never leaves an
 * orphaned upload behind, and a failed *upload* never blocks the rest of
 * the form.
 */
export function ImageUploadField({
  value,
  onChange,
  disabled,
  endpoint = "/api/uploads",
  rounded = false,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** Which upload route to post the file to \u2014 defaults to the item
   * photo endpoint. The Profile/Business Settings forms
   * pass `/api/uploads/avatar` instead (see that route's own doc comment
   * for why it needs no specific `Permission`). */
  endpoint?: string;
  /** Renders the preview/placeholder as a circle instead of a rounded
   * square \u2014 used for a person's avatar, left `false` for a product
   * image or a business logo. */
  rounded?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(endpoint, {
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

      onChange(payload.data.url);
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiClientError
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <div
          className={
            rounded
              ? "bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border"
              : "bg-muted flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
          }
        >
          {value ? (
            <Image
              src={value}
              alt=""
              width={80}
              height={80}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <ImageIcon
              className="text-muted-foreground size-6"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || isUploading}
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
                    <UploadIcon />
                    {value ? "Change image" : "Upload image"}
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <CameraIcon />
                  Take photo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => inputRef.current?.click()}>
                  <UploadIcon />
                  Choose file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove image"
                disabled={disabled || isUploading}
                onClick={() => onChange("")}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            JPEG, PNG, or WebP — up to 5 MB.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
