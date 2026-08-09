import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

interface BarcodeScannerProps {
  onDetected: (isbn: string) => void;
  paused?: boolean;
}

/** Normalizes a decoded barcode string down to digits/X (EAN-13/ISBN-10 formats). */
function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function BarcodeScanner({ onDetected, paused = false }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paused) {
      controlsRef.current?.stop();
      return;
    }

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (result) => {
          if (result && !cancelled) {
            const isbn = normalizeIsbn(result.getText());
            if (isbn.length >= 10) onDetected(isbn);
          }
        }
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not access camera."));

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onDetected, paused]);

  if (error) {
    return (
      <div className="scanner-error">
        <p>Camera unavailable: {error}</p>
        <p>You can still add books manually.</p>
      </div>
    );
  }

  return (
    <div className="scanner-frame">
      <video ref={videoRef} className="scanner-video" muted playsInline />
      <div className="scanner-reticle" aria-hidden="true" />
    </div>
  );
}
