"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { Button, ErrorMessage, LoadingState } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useConfiguration } from "@/context/configuration";
import {
  accountApi,
  AccountApiError,
  performUpload,
  resolveAssetUrl,
  sha256File,
  type CustomUpload,
} from "@/services/account-api";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const POLL_DELAYS = [2_000, 3_000, 5_000, 8_000, 10_000] as const;

const stateLabels: Readonly<Record<CustomUpload["state"], string>> = {
  awaiting_upload: "Awaiting upload",
  uploaded: "Queued for processing",
  processing: "Processing",
  awaiting_moderation: "Awaiting moderation",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Processing failed",
  deleted: "Deleted",
  expired: "Upload expired",
};

function defaultLabel(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").trim().slice(0, 120) || "My pattern";
}

async function validateImage(file: File): Promise<{ height: number; url: string; width: number }> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size < 1 || file.size > MAX_BYTES) throw new Error("Choose an image no larger than 10 MB.");
  const url = URL.createObjectURL(file);
  const dimensions = await new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () => reject(new Error("The browser could not preview this image."));
    image.src = url;
  });
  if (dimensions.width < 64 || dimensions.height < 64 || dimensions.width > 4096 || dimensions.height > 4096 || dimensions.width * dimensions.height > 16_000_000) {
    URL.revokeObjectURL(url);
    throw new Error("Image dimensions must be 64–4096 px per side and at most 16 million pixels.");
  }
  return { ...dimensions, url };
}

export function YourPatterns() {
  const { state: auth } = useAuth();
  const { state: configuration, dispatch } = useConfiguration();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [uploads, setUploads] = useState<readonly CustomUpload[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "uploading">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (auth.status !== "authenticated") return;
    setPhase("loading");
    try {
      setUploads(await accountApi.listUploads(auth.token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof AccountApiError ? caught.message : "Your patterns could not be loaded.");
    } finally {
      setPhase("idle");
    }
  }, [auth]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  const chooseFile = async (next: File | null) => {
    setError(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setFile(null);
    setDimensions(null);
    if (!next) return;
    try {
      const preview = await validateImage(next);
      setFile(next);
      setLabel(defaultLabel(next));
      setLocalPreview(preview.url);
      setDimensions(`${preview.width} × ${preview.height} px`);
      setMessage("Local repeat preview ready. The full image will be retained; no silent crop is applied.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Choose a valid image.");
      requestAnimationFrame(() => fileInput.current?.focus());
    }
  };

  const poll = async (uploadId: string, attempt = 0): Promise<void> => {
    if (auth.status !== "authenticated") return;
    const current = await accountApi.getUpload(auth.token, uploadId);
    setUploads((items) => [current, ...items.filter((item) => item.id !== current.id)]);
    if (["uploaded", "processing", "awaiting_moderation"].includes(current.state) && attempt < 20) {
      globalThis.setTimeout(() => void poll(uploadId, attempt + 1), POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]);
    }
  };

  const upload = async () => {
    if (auth.status !== "authenticated" || !file || !label.trim()) return;
    setPhase("uploading"); setError(null); setMessage("Creating a private upload operation…");
    try {
      const intent = await accountApi.createUploadIntent(auth.token, label.trim(), file);
      setMessage("Uploading directly to private quarantine storage…");
      await performUpload(intent.upload, file);
      setMessage("Upload transferred. Verifying checksum and queueing safe processing…");
      const confirmed = await accountApi.confirmUpload(auth.token, intent.id, await sha256File(file));
      setUploads((items) => [confirmed, ...items.filter((item) => item.id !== confirmed.id)]);
      setFile(null); setLocalPreview(null); setDimensions(null); setLabel("");
      setMessage("Upload queued. Processing and moderation continue in the durable worker.");
      requestAnimationFrame(() => statusRef.current?.focus());
      void poll(intent.id);
    } catch (caught) {
      setError(caught instanceof AccountApiError ? caught.message : caught instanceof Error ? caught.message : "The upload could not be completed.");
      requestAnimationFrame(() => fileInput.current?.focus());
    } finally { setPhase("idle"); }
  };

  const select = async (item: CustomUpload) => {
    if (auth.status !== "authenticated" || !item.tileDerivativeId || item.state !== "approved") return;
    try {
      const access = await accountApi.assetAccess(auth.token, item.id, "tile");
      dispatch({ type: "setCustomPattern", pattern: {
        kind: "custom", assetId: item.id, derivativeId: item.tileDerivativeId,
        processingVersion: item.processingVersion, label: item.label,
        previewUrl: resolveAssetUrl(access.url),
      } });
      setMessage(`${item.label} selected for this private project configuration.`);
    } catch (caught) { setError(caught instanceof AccountApiError ? caught.message : "The approved pattern could not be opened."); }
  };

  const retry = async (item: CustomUpload) => {
    if (auth.status !== "authenticated") return;
    try { await accountApi.retryUpload(auth.token, item.id); setMessage("Retry queued."); void poll(item.id); }
    catch (caught) { setError(caught instanceof AccountApiError ? caught.message : "Retry could not be queued."); }
  };

  const rename = async (item: CustomUpload) => {
    if (auth.status !== "authenticated") return;
    const next = window.prompt("New pattern label", item.label)?.trim();
    if (!next || next === item.label) return;
    try {
      const updated = await accountApi.renameUpload(auth.token, item.id, next);
      setUploads((items) => items.map((entry) => entry.id === updated.id ? updated : entry));
      setMessage("Pattern label updated.");
      requestAnimationFrame(() => statusRef.current?.focus());
    } catch (caught) { setError(caught instanceof AccountApiError ? caught.message : "The pattern label could not be updated."); }
  };

  const remove = async (item: CustomUpload) => {
    if (auth.status !== "authenticated") return;
    const warning = item.referencedByVersions > 0
      ? `This pattern is referenced by ${item.referencedByVersions} saved version${item.referencedByVersions === 1 ? "" : "s"}. Those versions will show “custom asset deleted.” Delete it anyway?`
      : "Delete this custom pattern and revoke all asset access?";
    if (!window.confirm(warning)) return;
    try {
      await accountApi.deleteUpload(auth.token, item.id);
      if (configuration.pattern?.kind === "custom" && configuration.pattern.assetId === item.id) {
        dispatch({ type: "setCustomPattern", pattern: { ...configuration.pattern, previewUrl: null, unavailableReason: "deleted" } });
      }
      await load(); setMessage("Custom pattern deleted and access revoked.");
      requestAnimationFrame(() => fileInput.current?.focus());
    } catch (caught) { setError(caught instanceof AccountApiError ? caught.message : "The custom pattern could not be deleted."); }
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-layout rounded-card border border-border-strong bg-surface-subtle p-card">
      <p className="text-label font-control text-accent-strong">Private account assets</p>
      <h3 id={`${id}-heading`} className="mt-2 font-display text-section-title font-heading">Your patterns</h3>
      {auth.status === "guest" ? <div className="mt-3"><p className="text-body text-text-muted">Sign in to upload private custom patterns. Guests can keep using all built-in patterns below.</p><Link className="mt-3 inline-flex min-h-11 items-center font-control text-brand underline" href="/account/">Sign in or register</Link></div> : null}
      {auth.status === "initializing" ? <LoadingState className="mt-3" label="Waking your private pattern workspace…" /> : null}
      {auth.status === "authenticated" ? <>
        <p className="mt-3 text-supporting text-text-muted">JPEG, PNG, or WebP; 1 byte–10 MB; 64–4096 px per side; one still frame; at most 16 million pixels. Originals stay private and are never served. An external moderation provider may process the normalized image when configured.</p>
        <div className="mt-4 rounded-card border border-dashed border-border-strong bg-surface p-control-x py-4" onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0] ?? null); }}>
          <label htmlFor={`${id}-file`} className="block font-control">Choose a pattern image</label>
          <input ref={fileInput} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full max-w-full" onChange={(event: ChangeEvent<HTMLInputElement>) => void chooseFile(event.target.files?.[0] ?? null)} />
          <p className="mt-2 text-supporting text-text-muted">You can also drop one file in this bordered area.</p>
        </div>
        {localPreview ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label htmlFor={`${id}-label`} className="block font-control">Pattern label</label><input id={`${id}-label`} value={label} maxLength={120} className="mt-2 min-h-12 w-full rounded-control border border-border-strong bg-surface px-control-x" onChange={(event) => setLabel(event.target.value)} /><p className="mt-2 text-supporting text-text-muted">{dimensions}. The complete image is used without cropping.</p><Button className="mt-3" isLoading={phase === "uploading"} loadingLabel="Uploading pattern…" onClick={() => void upload()}>Upload for review</Button></div><div><p className="font-control">Live repeating preview</p><div className="mt-2 aspect-square max-w-64 rounded-card border border-border-strong" style={{ backgroundImage: `url("${localPreview}")`, backgroundRepeat: "repeat", backgroundSize: "45% auto" }} aria-label="Repeating preview of the selected local image" /></div></div> : null}
        {phase === "loading" ? <LoadingState className="mt-4" label="Loading your patterns…" /> : null}
        {error ? <ErrorMessage className="mt-4">{error}</ErrorMessage> : null}
        {message ? <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mt-4 text-supporting text-text-muted">{message}</p> : null}
        {uploads.length > 0 ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{uploads.map((item) => <li key={item.id} className="rounded-card border border-border bg-surface p-control-x py-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-control">{item.label}</p><p className="mt-1 text-supporting text-text-muted">{stateLabels[item.state]}{item.moderationState === "unavailable" ? " — moderation unavailable; approval is fail-closed" : ""}</p></div>{item.state === "approved" ? <input type="radio" name="cushion-pattern" aria-label={`Select custom pattern ${item.label}`} checked={configuration.pattern?.kind === "custom" && configuration.pattern.assetId === item.id} onChange={() => void select(item)} /> : null}</div><div className="mt-3 flex flex-wrap gap-2">{item.state !== "deleted" && item.state !== "expired" ? <Button variant="secondary" onClick={() => void rename(item)}>Rename</Button> : null}{item.retryEligible ? <Button variant="secondary" onClick={() => void retry(item)}>Retry</Button> : null}{item.state !== "deleted" && item.state !== "expired" ? <Button variant="secondary" onClick={() => void remove(item)}>Delete</Button> : null}</div></li>)}</ul> : phase !== "loading" ? <p className="mt-4 text-supporting text-text-muted">No custom patterns yet.</p> : null}
      </> : null}
    </section>
  );
}
