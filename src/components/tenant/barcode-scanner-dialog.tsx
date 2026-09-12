"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, CameraIcon } from "lucide-react";

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
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

/**
 * Reads a barcode off the device camera and hands the digits back.
 *
 * Two decoders, in this order:
 *
 * 1. The browser's own `BarcodeDetector` where it exists (Chrome on
 *    Android — the counter's phone). It is hardware-accelerated and costs
 *    nothing to ship.
 * 2. `@zxing/browser` otherwise, which is what makes this work on iOS
 *    Safari, where `BarcodeDetector` does not exist at all.
 *
 * A USB/Bluetooth scanner needs none of this — it types the code and
 * presses Enter, which the search field already handles. This is for the
 * phone in someone's hand.
 */
type BarcodeScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the decoded value; the dialog closes itself first. */
  onScan: (value: string) => void;
};

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

/** The formats a rental label actually carries — `src/lib/barcode.ts`
 * generates EAN-13-shaped digits, and shops re-use existing Code 128 /
 * Code 39 labels. Narrowing the list makes detection faster and stops the
 * decoder reporting a QR code on a poster behind the counter. */
const FORMATS = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"];

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
}: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let frame: number | null = null;
    // Set when the zxing path is used, so it can be torn down the same way.
    let zxingControls: { stop: () => void } | null = null;

    function finish(value: string) {
      if (stopped) return;
      stopped = true;
      onOpenChange(false);
      onScan(value);
    }

    async function start() {
      setError(null);
      setStarting(true);

      try {
        // `facingMode: environment` is the rear camera on a phone and is
        // simply ignored by a laptop webcam.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStarting(false);

        const Detector = (
          window as unknown as {
            BarcodeDetector?: BarcodeDetectorConstructor;
          }
        ).BarcodeDetector;

        if (Detector) {
          const detector = new Detector({ formats: FORMATS });
          const tick = async () => {
            if (stopped) return;
            try {
              const found = await detector.detect(video);
              const value = found[0]?.rawValue?.trim();
              if (value) {
                finish(value);
                return;
              }
            } catch {
              // A frame that cannot be decoded is the normal case while
              // the user is still lining the label up — keep looking.
            }
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
          return;
        }

        // No native detector (iOS Safari): decode in JS instead. Imported
        // lazily so the ~200KB library only loads for the browsers that
        // actually need it, and only once someone opens the scanner.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromVideoElement(
          video,
          (result) => {
            const value = result?.getText()?.trim();
            if (value) finish(value);
          },
        );
      } catch (cause) {
        setStarting(false);
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site, or type the barcode instead."
            : "Could not start the camera. Type the barcode instead, or use a handheld scanner.",
        );
      }
    }

    void start();

    return () => {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, onOpenChange, onScan]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan a barcode</DialogTitle>
          <DialogDescription>
            Point the camera at the label on the item. It is added as soon as
            it reads.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {error ? (
            <Alert
              variant="destructive"
              className="border-destructive/25 bg-destructive/5"
            >
              <AlertCircleIcon />
              <AlertDescription className="text-destructive font-medium">
                {error}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="bg-muted relative aspect-[4/3] w-full overflow-hidden rounded-lg">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-cover"
              />
              {/* A frame to aim with: the decoder reads the whole image,
                  but people line barcodes up against an edge. */}
              <div className="pointer-events-none absolute inset-6 rounded-md border-2 border-white/70" />
              {starting ? (
                <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
                  <Spinner />
                  Starting camera…
                </div>
              ) : null}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The button that opens the scanner — kept here so every call site gets
 * the same affordance and the dialog stays an implementation detail. */
export function ScanBarcodeButton({
  onScan,
  disabled,
}: {
  onScan: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Scan a barcode with the camera"
        title="Scan a barcode"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <CameraIcon />
      </Button>
      <BarcodeScannerDialog open={open} onOpenChange={setOpen} onScan={onScan} />
    </>
  );
}
