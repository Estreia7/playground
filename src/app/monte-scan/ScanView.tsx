"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fileToDataUrl,
  makeBaseImage,
  suggestCrop,
  type BaseImage,
  type EnhanceMode,
  type ProcessedPage,
  type Rect,
} from "./imaging";
import { CropModal } from "./CropModal";
import { buildPdf, blobToBase64 } from "./pdf";
import {
  docTypeMeta,
  type Classification,
  type ScanPage,
  type StoredDoc,
} from "./types";

let pageSeq = 0;

interface PendingCrop {
  base: BaseImage;
  suggested: Rect;
}

export function ScanView({ onSaved }: { onSaved: (doc: StoredDoc) => void }) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [mode, setMode] = useState<EnhanceMode>("auto");
  const [pending, setPending] = useState<PendingCrop | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const [classification, setClassification] = useState<Classification | null>(null);
  const [classifying, setClassifying] = useState(false);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Attach the stream once the <video> is actually in the DOM (cameraOn flips
  // it on). Doing this in an effect — not a one-shot rAF — is what makes the
  // live preview reliably render on mobile Safari/Chrome.
  useEffect(() => {
    if (!cameraOn) return;
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream) return;

    v.srcObject = stream;
    v.setAttribute("playsinline", "true");
    v.muted = true;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled && v.videoWidth > 0) setCameraReady(true);
    };
    v.addEventListener("loadedmetadata", markReady);
    v.addEventListener("playing", markReady);

    v.play().catch(() => {
      // Autoplay may reject until a user gesture; the tracks are still live so
      // a frame usually arrives shortly and 'playing' fires.
    });

    // Safety net: some browsers don't fire the events reliably.
    const t = setTimeout(markReady, 800);

    return () => {
      cancelled = true;
      clearTimeout(t);
      v.removeEventListener("loadedmetadata", markReady);
      v.removeEventListener("playing", markReady);
    };
  }, [cameraOn]);

  async function startCamera() {
    setError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      // Older/insecure-context browsers: fall back to native camera capture.
      cameraInputRef.current?.click();
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        // Retry without the facingMode constraint (some webcams reject it).
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setCameraReady(false);
      setCameraOn(true); // effect above attaches + plays the stream
    } catch (e) {
      stopCamera();
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError(
          "Camera permission was blocked. Opening the device camera instead."
        );
      } else if (name === "NotFoundError") {
        setError("No camera found — opening the device camera instead.");
      } else {
        setError("Live camera unavailable here — opening the device camera.");
      }
      cameraInputRef.current?.click();
    }
  }

  // From any source image → prepare a base image + suggested crop → open modal.
  async function prepare(src: string) {
    setPreparing(true);
    setError(null);
    try {
      const base = await makeBaseImage(src);
      const suggested = await suggestCrop(base);
      setPending({ base, suggested });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process that image.");
    } finally {
      setPreparing(false);
    }
  }

  async function captureFromVideo() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is still warming up — try Capture again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    await prepare(canvas.toDataURL("image/jpeg", 0.95));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    if (file.type.startsWith("image/") || file.type === "") {
      try {
        const url = await fileToDataUrl(file);
        await prepare(url);
      } catch {
        setError("Could not read that file.");
      }
    } else {
      setError("Please choose an image file.");
    }
    if (uploadRef.current) uploadRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // Auto-classify using the first page whenever pages change to a non-empty set
  // and we don't yet have a classification.
  async function autoClassify(firstDataUrl: string) {
    setClassifying(true);
    try {
      const res = await fetch("/api/monte-scan/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: firstDataUrl, mediaType: "image/jpeg" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Detection failed");
      const c = json.classification as Classification;
      setClassification(c);
      setName((prev) => prev || c.suggestedName || c.label || "scan");
    } catch (e) {
      // Non-fatal: keep the page, just show a soft note.
      setError(
        e instanceof Error
          ? `Auto-detect skipped: ${e.message}`
          : "Auto-detect skipped."
      );
    } finally {
      setClassifying(false);
    }
  }

  function acceptCrop(page: ProcessedPage) {
    const isFirst = pages.length === 0;
    const newPage: ScanPage = {
      id: `p${pageSeq++}`,
      dataUrl: page.dataUrl,
      width: page.width,
      height: page.height,
    };
    setPages((prev) => [...prev, newPage]);
    setPending(null);
    if (isFirst) autoClassify(page.dataUrl); // auto-detect on first page
  }

  function removePage(id: string) {
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 0) setClassification(null);
      return next;
    });
  }

  async function save() {
    if (!pages.length) return;
    setSaving(true);
    setError(null);
    try {
      const blob = buildPdf(pages);
      const pdfBase64 = await blobToBase64(blob);
      const res = await fetch("/api/monte-scan/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || classification?.suggestedName || "scan",
          docType: classification?.docType ?? "other",
          label: classification?.label ?? "Document",
          tags: classification?.tags ?? [],
          pages: pages.length,
          pdfBase64,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      onSaved(json.document as StoredDoc);
      setPages([]);
      setClassification(null);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function downloadPreview() {
    const blob = buildPdf(pages);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "scan"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const meta = classification ? docTypeMeta(classification.docType) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Left: capture surface */}
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <div className="relative aspect-[4/3] bg-black">
            {cameraOn ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-6">
                  {(["tl", "tr", "bl", "br"] as const).map((c) => (
                    <span
                      key={c}
                      className={`absolute h-8 w-8 border-orange-500 ${
                        c === "tl"
                          ? "left-0 top-0 border-l-2 border-t-2"
                          : c === "tr"
                          ? "right-0 top-0 border-r-2 border-t-2"
                          : c === "bl"
                          ? "bottom-0 left-0 border-b-2 border-l-2"
                          : "bottom-0 right-0 border-b-2 border-r-2"
                      }`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-600">
                <ScanIcon />
                <p className="text-sm">Take a photo or upload a file</p>
                <p className="text-xs text-zinc-700">
                  We&apos;ll auto-crop and detect the type for you
                </p>
              </div>
            )}
            {cameraOn && !cameraReady && !preparing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-zinc-300">
                Starting camera…
              </div>
            )}
            {preparing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-zinc-200">
                Preparing crop…
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 p-3">
            {!cameraOn ? (
              <>
                <button
                  onClick={startCamera}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
                >
                  Live camera
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                >
                  Take photo
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={captureFromVideo}
                  disabled={preparing || !cameraReady}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
                >
                  {cameraReady ? "Capture" : "Starting…"}
                </button>
                <button
                  onClick={stopCamera}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                >
                  Stop camera
                </button>
              </>
            )}

            <button
              onClick={() => uploadRef.current?.click()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Upload file
            </button>

            {/* Native camera capture (mobile fallback) */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
            {/* Plain file picker */}
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>
        </div>

        {/* Pages strip */}
        {pages.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-300">
                Pages ({pages.length})
              </h3>
              <button
                onClick={() => {
                  setPages([]);
                  setClassification(null);
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <AnimatePresence>
                {pages.map((p, i) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group relative"
                  >
                    <img
                      src={p.dataUrl}
                      alt={`Page ${i + 1}`}
                      className="h-32 w-24 rounded-lg border border-zinc-700 object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] text-zinc-200">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => removePage(p.id)}
                      className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 ring-1 ring-zinc-600 hover:bg-red-600 hover:text-white group-hover:flex"
                      aria-label="Remove page"
                    >
                      ×
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Right: auto-detected type + save */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-300">Document type</h3>
            {classifying && (
              <span className="text-xs text-orange-400">detecting…</span>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!pages.length ? (
              <p key="empty" className="mt-2 text-xs text-zinc-500">
                Capture a page and Monte Scan will auto-detect what it is.
              </p>
            ) : classifying ? (
              <div key="loading" className="mt-3 space-y-2">
                <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-48 animate-pulse rounded bg-zinc-800" />
              </div>
            ) : classification && meta ? (
              <motion.div
                key="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {classification.label}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {Math.round((classification.confidence ?? 0) * 100)}%
                      confidence · {meta.label}
                    </p>
                  </div>
                </div>
                {classification.summary && (
                  <p className="text-xs text-zinc-400">{classification.summary}</p>
                )}
                {classification.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {classification.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => pages[0] && autoClassify(pages[0].dataUrl)}
                  className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                >
                  Re-detect
                </button>
              </motion.div>
            ) : (
              <button
                key="retry"
                onClick={() => pages[0] && autoClassify(pages[0].dataUrl)}
                className="mt-3 w-full rounded-lg border border-orange-600/40 bg-orange-600/10 px-4 py-2 text-sm font-medium text-orange-300 hover:bg-orange-600/20"
              >
                Detect document type
              </button>
            )}
          </AnimatePresence>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <label className="text-sm font-medium text-zinc-300">
            Document name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. cartao-cidadao"
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-600"
          />

          <div className="mt-4 space-y-2">
            <button
              onClick={save}
              disabled={!pages.length || saving}
              className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-40"
            >
              {saving
                ? "Saving…"
                : `Save PDF (${pages.length} page${
                    pages.length === 1 ? "" : "s"
                  })`}
            </button>
            <button
              onClick={downloadPreview}
              disabled={!pages.length}
              className="w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-40"
            >
              Preview / download
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-300">
            {error}
          </div>
        )}
      </div>

      {pending && (
        <CropModal
          base={pending.base}
          suggested={pending.suggested}
          mode={mode}
          onModeChange={setMode}
          onCancel={() => setPending(null)}
          onAccept={acceptCrop}
          busy={false}
        />
      )}
    </div>
  );
}

function ScanIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}
