"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, RefreshCwIcon, VideoOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** JPEG rather than PNG: a 720p PNG frame is several megabytes, the same
 * frame as JPEG is ~150 KB, and this is a photograph, not a diagram. */
const CAPTURE_TYPE = "image/jpeg";
const CAPTURE_QUALITY = 0.85;

/** Thrown for the cases the browser cannot even attempt — no secure
 * context, no `mediaDevices` — so they travel the same rejected-promise
 * path as a real `getUserMedia` failure instead of needing their own
 * synchronous branch (which would mean setting state during an effect). */
class CameraUnavailableError extends Error {}

/** Every route out of a camera failure ends here: a check-in cannot be
 * completed without a photo, and there is no self-service way around that,
 * so the honest next step is to go and speak to a manager. Deliberately
 * does not promise they will check you in — `correctAttendance` only edits
 * a record that already exists, so nobody can create one from nothing. */
const ASK_MANAGER = "If you can't fix it, ask your manager for help.";

/**
 * Turns a `getUserMedia` failure into something a person standing at a
 * counter can act on. The `name` values are the standard ones browsers
 * throw; the fallbacks cover older WebKit spellings.
 *
 * Where the person can plausibly fix it themselves the message leads with
 * that and offers the manager as a fallback; where they cannot (no camera
 * at all, a browser without the API) it goes straight to the manager
 * rather than suggesting something that will not work.
 */
function describeCameraError(error: unknown): string {
  if (error instanceof CameraUnavailableError) {
    return error.message;
  }

  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return `Camera access was denied. Allow it for this site and try again. ${ASK_MANAGER}`;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device. You'll need a device with a camera to check in — ask your manager for help.";
    case "NotReadableError":
    case "TrackStartError":
      return `Your camera is being used by another app. Close it and try again. ${ASK_MANAGER}`;
    default:
      return `Couldn't start the camera. Please try again. ${ASK_MANAGER}`;
  }
}

async function requestStream(): Promise<MediaStream> {
  // getUserMedia is only exposed on secure origins. Saying so beats the
  // bare "undefined is not an object" the call would otherwise produce.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new CameraUnavailableError(
      "The camera needs a secure (https) connection. Ask your manager for help.",
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraUnavailableError(
      "This browser doesn't support camera access. Try a different browser, or ask your manager for help.",
    );
  }

  return navigator.mediaDevices.getUserMedia({
    // `facingMode` is a hint, not a constraint — a laptop with one webcam
    // has no "user" camera to select and would reject an exact constraint
    // outright.
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

/**
 * Live front-camera capture used by attendance check-in.
 *
 * The stream starts on mount and stops on unmount — the parent renders
 * this only while its dialog is open, so the camera light never stays on
 * after the dialog closes. The preview is mirrored (a self-view that isn't
 * mirrored feels wrong to everyone who has used a mirror), but the frame
 * drawn to the canvas is not, so the stored photo is the true image rather
 * than a flipped one.
 */
export function CameraCapture({
  onCapture,
  disabled = false,
}: {
  onCapture: (photo: Blob | null) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "error">(
    "starting",
  );
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Every state write here lands after an `await`, never synchronously
  // inside the mount effect below — a synchronous set there re-renders
  // mid-commit and the compiler rejects it.
  const openCamera = useCallback(async () => {
    try {
      const stream = await requestStream();
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Autoplay can be refused; the element is muted + playsInline so
        // this is rare, and the controls below still work.
        await videoRef.current.play().catch(() => {});
      }

      setStatus("ready");
      setError(null);
    } catch (startError) {
      stopStream();
      setStatus("error");
      setError(describeCameraError(startError));
    }
  }, [stopStream]);

  useEffect(() => {
    // Starting a camera and reflecting whether it opened is precisely the
    // external-system synchronisation an effect is for. Every state write
    // inside `openCamera` happens after an `await`, so none of them run
    // synchronously during this commit — the rule flags the call because
    // static analysis cannot see through the await, not because a
    // cascading render actually occurs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void openCamera();
    return stopStream;
  }, [openCamera, stopStream]);

  // Revoke the object URL a retake replaces, so a few retakes don't leak
  // a blob per attempt for the life of the page.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function restart() {
    setStatus("starting");
    setError(null);
    void openCamera();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Couldn't capture the photo. Please try again.");
          return;
        }
        setPreview(URL.createObjectURL(blob));
        onCapture(blob);
        stopStream();
      },
      CAPTURE_TYPE,
      CAPTURE_QUALITY,
    );
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onCapture(null);
    restart();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted relative aspect-[3/4] w-full overflow-hidden rounded-xl sm:aspect-square">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the camera, not an optimisable asset
          <img
            src={preview}
            alt="The photo you just took"
            className="size-full -scale-x-100 object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Live camera preview"
            className="size-full -scale-x-100 object-cover"
          />
        )}

        {status === "starting" && !preview ? (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Spinner />
            Starting camera…
          </div>
        ) : null}

        {status === "error" && !preview ? (
          <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <VideoOffIcon className="size-6" aria-hidden="true" />
            <p className="text-sm">{error}</p>
          </div>
        ) : null}
      </div>

      {status === "error" ? (
        <Button type="button" variant="outline" onClick={restart}>
          <RefreshCwIcon aria-hidden="true" />
          Try camera again
        </Button>
      ) : preview ? (
        <Button
          type="button"
          variant="outline"
          onClick={retake}
          disabled={disabled}
        >
          <RefreshCwIcon aria-hidden="true" />
          Retake photo
        </Button>
      ) : (
        <Button
          type="button"
          onClick={capture}
          disabled={disabled || status !== "ready"}
        >
          <CameraIcon aria-hidden="true" />
          Take photo
        </Button>
      )}

      {error && status !== "error" ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}
    </div>
  );
}
