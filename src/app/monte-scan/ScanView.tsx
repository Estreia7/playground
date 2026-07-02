"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fileToDataUrl, processPage, type EnhanceMode } from "./imaging";
import { buildPdf, blobToBase64 } from "./pdf";
import {
  docTypeMeta,
  type Classification,
  type ScanPage,
  type StoredDoc,
} from "./types";

let pageSeq = 0;

export function ScanView({ onSaved }: { onSaved: (doc: StoredDoc) => void }) {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [mode, setMode] = useState<EnhanceMode>("auto");
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [classification, setClassification] = useState<Classification | null>(
    null
  );
  const [classifying, setClassifying] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError(
        "Camera unavailable. Grant permission, use HTTPS, or upload a file instead."
      );
    }
  }

  async function addProcessed(dataUrl: string) {
    setBusy(true);
    try {
      const p = await processPage(dataUrl, mode);
      setPages((prev) => [
        ...prev,
        { id: `p${pageSeq++}`, dataUrl: p.dataUrl, width: p.width, height: p.height },
      ]);
      setClassification(null); // stale once pages change
    } catch {
      setError("Could not process that image.");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    await addProcessed(canvas.toDataURL("image/jpeg", 0.95));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = await fileToDataUrl(file);
      await addProcessed(url);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setClassification(null);
  }

  async function reprocessAll(next: EnhanceMode) {
    // Note: re-enhancing an already-processed JPEG compounds a little, but is
    // fine for a preview toggle. Fresh captures use the current mode directly.
    setMode(next);
  }

  async function classify() {
    if (!pages.length) return;
    setClassifying(true);
    setError(null);
    try {
      const first = pages[0];
      const base64 = first.dataUrl.split(",")[1];
      const res = await fetch("/api/monte-scan/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType: "image/jpeg" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Classification failed");
      const c = json.classification as Classification;
      setClassification(c);
      if (!name) setName(c.suggestedName || c.label || "scan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setClassifying(false);
    }
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
      // reset
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
                  muted
                  className="h-full w-full object-cover"
                />
                {/* viewfinder brackets */}
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
                <p className="text-sm">Start the camera or upload a file</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 p-3">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
              >
                Start camera
              </button>
            ) : (
              <>
                <button
                  onClick={capture}
                  disabled={busy}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
                >
                  {busy ? "Processing…" : "Capture page"}
                </button>
                <button
                  onClick={stopCamera}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                >
                  Stop
                </button>
              </>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />

            <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-800 p-1">
              {(["auto", "color", "grayscale", "bw"] as EnhanceMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => reprocessAll(m)}
                  className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
                    mode === m
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {m === "bw" ? "B&W" : m}
                </button>
              ))}
            </div>
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
                onClick={() => setPages([])}
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

      {/* Right: details / actions */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="text-sm font-medium text-zinc-300">Auto-detect</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Claude reads the first page to detect the document type and suggest a
            name.
          </p>

          <button
            onClick={classify}
            disabled={!pages.length || classifying}
            className="mt-3 w-full rounded-lg border border-orange-600/40 bg-orange-600/10 px-4 py-2 text-sm font-medium text-orange-300 transition-colors hover:bg-orange-600/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {classifying ? "Detecting…" : "Detect document type"}
          </button>

          <AnimatePresence>
            {classification && meta && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-2 overflow-hidden"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{meta.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {classification.label}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {Math.round(classification.confidence * 100)}% confidence ·{" "}
                      {meta.label}
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
              </motion.div>
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
              {saving ? "Saving…" : `Save PDF (${pages.length} page${pages.length === 1 ? "" : "s"})`}
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
          <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}
