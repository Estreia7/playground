"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCamera, IconCheck, IconClose, IconImages, IconRotate } from "../Icons.tsx";
import { filterCanvas, limitSize, rotateCanvas } from "./image.ts";
import { isTrustworthy, maxCornerShift, stabilityStep, type Corners, type StabilityState } from "./stability.ts";
import { pagesToPdf } from "./pdf.ts";

/* A document scanner for papers with several pages, built on the one in
   REST-Finance: the camera outlines the sheet, takes the photo by itself once
   it holds still, straightens it and cleans the shadows. Turn the page and it
   takes the next one. "Criar PDF" joins every page into one file.

   On a computer, or if the camera is refused, the same thing works from
   photos chosen from the gallery: each is straightened and cleaned the same way. */

const DETECT_WIDTH = 480;
const DETECT_INTERVAL_MS = 160;
const PAGE_EDGE = 2000;
/** After a capture, the next one waits until the page in view has changed. */
const REARM_SHIFT = 40;

interface Page {
  id: number;
  canvas: HTMLCanvasElement;
  thumb: string;
}

type ScanDocument = (img: HTMLCanvasElement, opts?: unknown) => Promise<{ corners: Corners | null; score?: number | null }>;
/** Detection that takes too long is skipped: the page is kept as photographed. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

type ExtractDocument = (img: HTMLCanvasElement, corners: Corners, opts: { output: "canvas" }) => Promise<{ output: unknown }>;

const portalRoot = () => document.querySelector(".rs") ?? document.body;

function thumbOf(canvas: HTMLCanvasElement): string {
  const t = limitSize(canvas, 220);
  return t.toDataURL("image/jpeg", 0.7);
}

export function Scanner({
  title,
  maxBytes,
  onDone,
  onClose,
}: {
  title: string;
  maxBytes: number;
  onDone: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smallRef = useRef<HTMLCanvasElement | null>(null);
  const cornersRef = useRef<Corners | null>(null);
  const stabilityRef = useRef<StabilityState>({ previous: null, steadySince: null });
  const armedRef = useRef(true);
  const lastShotRef = useRef<Corners | null>(null);
  const autoRef = useRef(true);
  const libRef = useRef<{ scan: ScanDocument; extract: ExtractDocument } | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(true);
  const [auto, setAuto] = useState(true);
  const [pages, setPages] = useState<Page[]>([]);
  const [working, setWorking] = useState(0);
  const [flash, setFlash] = useState(0);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  const loadLib = useCallback(async () => {
    if (!libRef.current) {
      const mod = await import("scanic");
      libRef.current = {
        scan: mod.scanDocument as unknown as ScanDocument,
        extract: mod.extractDocument as unknown as ExtractDocument,
      };
    }
    return libRef.current;
  }, []);

  /** Straighten to the detected sheet, clean it, keep it to a sensible size. */
  const addPage = useCallback(
    async (frame: HTMLCanvasElement, corners: Corners | null) => {
      setWorking((n) => n + 1);
      try {
        let page = frame;
        if (corners) {
          try {
            const { extract } = await loadLib();
            const res = await withTimeout(extract(frame, corners, { output: "canvas" }), 6000);
            if (res.output instanceof HTMLCanvasElement) page = res.output;
          } catch {
            // keep the photo as taken
          }
        }
        const finished = limitSize(filterCanvas(page, "enhanced"), PAGE_EDGE);
        setPages((list) => [...list, { id: nextId.current++, canvas: finished, thumb: thumbOf(finished) }]);
      } finally {
        setWorking((n) => n - 1);
      }
    },
    [loadLib],
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const frame = document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext("2d")?.drawImage(video, 0, 0);
    const c = cornersRef.current;
    const k = video.videoWidth / DETECT_WIDTH;
    const scaled: Corners | null = c
      ? {
          topLeft: { x: c.topLeft.x * k, y: c.topLeft.y * k },
          topRight: { x: c.topRight.x * k, y: c.topRight.y * k },
          bottomRight: { x: c.bottomRight.x * k, y: c.bottomRight.y * k },
          bottomLeft: { x: c.bottomLeft.x * k, y: c.bottomLeft.y * k },
        }
      : null;
    armedRef.current = false;
    setArmed(false);
    lastShotRef.current = c;
    stabilityRef.current = { previous: null, steadySince: null };
    setFlash((n) => n + 1);
    navigator.vibrate?.(30);
    void addPage(frame, scaled);
  }, [addPage]);

  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  const paint = useCallback(() => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video || !video.videoWidth) return;
    if (overlay.width !== video.clientWidth || overlay.height !== video.clientHeight) {
      overlay.width = video.clientWidth;
      overlay.height = video.clientHeight;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const c = cornersRef.current;
    if (!c) return;
    // The preview is object-cover: map detector points through the same crop.
    const scale = Math.max(overlay.width / video.videoWidth, overlay.height / video.videoHeight);
    const ox = (overlay.width - video.videoWidth * scale) / 2;
    const oy = (overlay.height - video.videoHeight * scale) / 2;
    const k = video.videoWidth / DETECT_WIDTH;
    const pt = (p: { x: number; y: number }) => ({ x: p.x * k * scale + ox, y: p.y * k * scale + oy });
    const quad = [pt(c.topLeft), pt(c.topRight), pt(c.bottomRight), pt(c.bottomLeft)];
    const settling = stabilityRef.current.steadySince !== null && armedRef.current;
    const tone = !armedRef.current ? "212, 236, 221" : settling ? "255, 255, 255" : "224, 138, 30";
    ctx.beginPath();
    quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = `rgba(${tone}, 0.18)`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${tone})`;
    ctx.lineWidth = settling ? 4 : 3;
    ctx.stroke();
  }, []);

  // Camera and detection loop. Stopped by the same effect that started it.
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let busy = false;
    let last = 0;

    const detect = async () => {
      const video = videoRef.current;
      const lib = libRef.current;
      if (!video || !video.videoWidth || busy || !lib) return;
      const now = performance.now();
      if (now - last < DETECT_INTERVAL_MS) return;
      last = now;
      busy = true;
      try {
        if (!smallRef.current) smallRef.current = document.createElement("canvas");
        const small = smallRef.current;
        small.width = DETECT_WIDTH;
        small.height = Math.round((DETECT_WIDTH * video.videoHeight) / video.videoWidth);
        const sctx = small.getContext("2d", { willReadFrequently: true });
        if (!sctx) return;
        sctx.drawImage(video, 0, 0, small.width, small.height);
        const result = await lib.scan(small);
        if (cancelled) return;
        const raw = result?.corners ?? null;
        const corners = raw && isTrustworthy(raw, result?.score, small.width, small.height) ? raw : null;
        cornersRef.current = corners;
        setFound(Boolean(corners));

        // After a shot, wait for the page to change before the next one.
        if (!armedRef.current) {
          const shot = lastShotRef.current;
          if (!corners || !shot || maxCornerShift(shot, corners) > REARM_SHIFT) {
            armedRef.current = true;
            setArmed(true);
          }
          setHolding(false);
          return;
        }
        const step = stabilityStep(stabilityRef.current, corners, result?.score, small.width, small.height, now);
        stabilityRef.current = step.state;
        setHolding(step.holding && autoRef.current);
        if (step.shouldCapture && autoRef.current) captureRef.current();
      } catch {
        // one bad frame; the next is 160 ms away
      } finally {
        busy = false;
      }
    };

    const loop = () => {
      if (cancelled) return;
      void detect();
      paint();
      raf = requestAnimationFrame(loop);
    };

    (async () => {
      try {
        await loadLib();
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => undefined);
        }
        setCamera("on");
        raf = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        setCameraError(
          denied
            ? "Sem acesso à câmara. Autorize-a nas definições do browser, ou escolha fotografias."
            : "Não há câmara disponível aqui. Escolha fotografias das páginas.",
        );
        setCamera("off");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [loadLib, paint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  /** Photos from the gallery: detect the sheet in each and add it as a page. */
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    setWorking((n) => n + 1);
    const lib = await withTimeout(loadLib(), 8000).catch(() => null);
    setWorking((n) => n - 1);
    for (const file of list) {
      if (!file.type.startsWith("image/")) continue;
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        continue;
      }
      const frame = document.createElement("canvas");
      frame.width = bitmap.width;
      frame.height = bitmap.height;
      frame.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      let corners: Corners | null = null;
      if (lib) {
        try {
          const small = limitSize(frame, DETECT_WIDTH);
          const res = await withTimeout(lib.scan(small), 4000);
          if (res.corners && isTrustworthy(res.corners, res.score, small.width, small.height)) {
            const k = frame.width / small.width;
            const c = res.corners;
            corners = {
              topLeft: { x: c.topLeft.x * k, y: c.topLeft.y * k },
              topRight: { x: c.topRight.x * k, y: c.topRight.y * k },
              bottomRight: { x: c.bottomRight.x * k, y: c.bottomRight.y * k },
              bottomLeft: { x: c.bottomLeft.x * k, y: c.bottomLeft.y * k },
            };
          }
        } catch {
          // use the whole photo
        }
      }
      await addPage(frame, corners);
    }
  }

  function rotate(id: number) {
    setPages((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const canvas = rotateCanvas(p.canvas, 90);
        return { ...p, canvas, thumb: thumbOf(canvas) };
      }),
    );
  }

  async function finish() {
    if (!pages.length || building) return;
    setBuilding(true);
    try {
      const file = await pagesToPdf(
        pages.map((p) => p.canvas),
        title,
        maxBytes,
      );
      onDone(file);
    } finally {
      setBuilding(false);
    }
  }

  const status =
    camera === "starting"
      ? "A abrir a câmara…"
      : !armed && pages.length
        ? "Página guardada. Vire para a seguinte."
        : holding
          ? "Não mexa…"
          : found
            ? auto
              ? "Documento encontrado"
              : "Documento encontrado. Toque para fotografar."
            : "Aponte para a folha";

  return createPortal(
    <div className="rs-scanner" role="dialog" aria-modal="true" aria-label={`Digitalizar ${title}`}>
      <header>
        <button type="button" className="round" onClick={onClose} aria-label="Fechar">
          <IconClose size={20} />
        </button>
        <div className="min-w-0 text-center">
          <div className="t">Digitalizar</div>
          <div className="s">{title}</div>
        </div>
        <button
          type="button"
          className={`auto ${auto ? "on" : ""}`}
          aria-pressed={auto}
          onClick={() => setAuto((a) => !a)}
          disabled={camera !== "on"}
        >
          Auto
        </button>
      </header>

      <div className="stage">
        <video ref={videoRef} playsInline muted autoPlay />
        <canvas ref={overlayRef} />
        {flash > 0 && <span key={flash} className="flash" aria-hidden="true" />}
        {camera === "on" && (
          <p className="status" role="status">
            {status}
          </p>
        )}
        {camera === "starting" && <p className="status">A abrir a câmara…</p>}
        {camera === "off" && (
          <div className="fallback">
            <p>{cameraError}</p>
            <button type="button" className="rs-btn primary" onClick={() => pickRef.current?.click()}>
              <IconImages size={18} />
              Escolher fotografias
            </button>
            <span className="hint">Pode escolher várias de uma vez, uma por página.</span>
          </div>
        )}
      </div>

      {(pages.length > 0 || working > 0) && (
        <ol className="strip" aria-label="Páginas digitalizadas">
          {pages.map((p, i) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={`Página ${i + 1}`} />
              <span className="n">{i + 1}</span>
              <button type="button" className="mini rot" onClick={() => rotate(p.id)} aria-label={`Rodar página ${i + 1}`}>
                <IconRotate size={13} />
              </button>
              <button
                type="button"
                className="mini del"
                onClick={() => setPages((list) => list.filter((x) => x.id !== p.id))}
                aria-label={`Remover página ${i + 1}`}
              >
                <IconClose size={13} />
              </button>
            </li>
          ))}
          {working > 0 && (
            <li className="working" aria-label="A processar página">
              <span className="spin" />
            </li>
          )}
        </ol>
      )}

      <footer>
        <button type="button" className="side" onClick={() => pickRef.current?.click()} aria-label="Escolher fotografias">
          <IconImages size={24} />
        </button>
        <button type="button" className="shutter" onClick={capture} disabled={camera !== "on"} aria-label="Fotografar página">
          <IconCamera size={28} />
        </button>
        <button
          type="button"
          className="done"
          onClick={finish}
          disabled={!pages.length || working > 0 || building}
        >
          {building ? (
            "A criar…"
          ) : (
            <>
              <IconCheck size={16} />
              Criar PDF{pages.length ? ` · ${pages.length}` : ""}
            </>
          )}
        </button>
      </footer>

      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addPhotos(e.target.files);
          e.target.value = "";
        }}
      />
    </div>,
    portalRoot(),
  );
}
