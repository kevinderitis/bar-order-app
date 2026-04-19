import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function QRScanner({ onClose, onScan }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const scannedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let startTimer;
    const reader = new BrowserQRCodeReader();

    async function startCamera() {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result, scanError, callbackControls) => {
            if (scanError || !result || !active || scannedRef.current) return;

            scannedRef.current = true;
            callbackControls?.stop();
            onScan(result.getText());
          }
        );

        if (!active) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
      } catch {
        if (!active) return;
        setError("Camera access is required to scan the QR code");
      }
    }

    startTimer = window.setTimeout(startCamera, 120);

    return () => {
      active = false;
      window.clearTimeout(startTimer);
      controlsRef.current?.stop();
    };
  }, [onScan]);

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="QR scanner">
      <div className="scanner-panel">
        <button className="icon-button scanner-close" type="button" onClick={onClose} aria-label="Close scanner">
          <X size={20} />
        </button>
        <div className="scanner-frame">
          <video ref={videoRef} className="scanner-video" muted playsInline />
          <div className="scanner-reticle" />
        </div>
        <div className="scanner-foot">
          <Camera size={18} />
          <span>{error || "Point your camera at the bar QR"}</span>
        </div>
      </div>
    </div>
  );
}
