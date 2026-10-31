"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { endIdleSessionAction, uploadCaptureAction } from "./kiosk-actions";

/** Ends the session after `seconds` without touch/mouse/key activity and returns to the welcome screen. */
export function IdleTimer({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await endIdleSessionAction();
        router.replace("/kiosk");
      }, seconds * 1000);
    };
    const events = ["pointerdown", "pointermove", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [router, seconds]);
  return null;
}

/** Re-fetches server state while a job is genuinely in flight. It shows no invented progress. */
export function Refresher({ everyMs = 2000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}

export function KioskButton({ children, onClick, variant = "primary", disabled }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary"; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-sm px-8 font-medium disabled:opacity-50 ${variant === "primary" ? "bg-champagne text-espresso" : "border border-ivory text-ivory"}`}>
      {children}
    </button>
  );
}

type Phase = "starting" | "live" | "uploading" | "review" | "error";

export function CaptureScreen({ alreadyHasPhoto }: { alreadyHasPhoto: boolean }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>(alreadyHasPhoto ? "review" : "starting");
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  async function openStream() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1920 } }, audio: false });
      if (video.current) video.current.srcObject = stream.current;
      // "live" is set by the video element once frames are really flowing (onLoadedData).
    } catch {
      setPhase("error");
      setMessage("We couldn't use the camera. Please allow camera access, or ask our team for help.");
    }
  }
  function startCamera() {
    setMessage(null);
    setPhase("starting");
    void openStream();
  }
  const stopCamera = () => stream.current?.getTracks().forEach((t) => t.stop());

  useEffect(() => {
    // Opening the camera is subscribing to an external device; state is only set after the async permission result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!alreadyHasPhoto) void openStream();
    return stopCamera;
  }, [alreadyHasPhoto]);

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) {
      setMessage("The camera isn't ready yet. Please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    setPhase("uploading");
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return setPhase("error");
    const fd = new FormData();
    fd.set("photo", new File([blob], "capture.jpg", { type: "image/jpeg" }));
    const res = await uploadCaptureAction(fd);
    if (res.ok) {
      stopCamera();
      setVersion((n) => n + 1);
      setPhase("review");
    } else {
      setMessage(res.error ?? "That didn't work. Please try again.");
      setPhase("live");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-4xl">{phase === "review" ? "Happy with your photo?" : "Stand back so we can see you, head to toe"}</h1>
      {phase === "review" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/kiosk/asset/input?v=${version}`} alt="Your photo" className="max-h-[60vh] rounded-sm" />
      ) : (
        <video ref={video} autoPlay playsInline muted onLoadedData={() => setPhase((p) => (p === "starting" ? "live" : p))} className="max-h-[60vh] w-full rounded-sm bg-black object-contain [transform:scaleX(-1)]" aria-label="Camera preview" />
      )}
      {message ? <p role="alert" className="text-champagne">{message}</p> : null}
      <div className="flex flex-wrap justify-center gap-4">
        {phase === "live" ? <KioskButton onClick={capture}>Take photo</KioskButton> : null}
        {phase === "uploading" ? <p>Saving…</p> : null}
        {phase === "error" ? <KioskButton onClick={startCamera}>Try the camera again</KioskButton> : null}
        {phase === "review" ? (
          <>
            <KioskButton variant="secondary" onClick={startCamera}>Retake</KioskButton>
            <KioskButton onClick={() => router.push("/kiosk/collections")}>Use this photo</KioskButton>
          </>
        ) : null}
      </div>
    </div>
  );
}
