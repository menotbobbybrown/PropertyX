/**
 * File storage. Two visibilities:
 *  - public:  listing photos, floor plans, avatars, chat images (served at /media/<key>)
 *  - private: CNIC / ownership documents, contracts (NEVER served statically; streamed
 *             only through the authorised /api/v1/documents/:id route)
 * Drivers (STORAGE_DRIVER):
 *  - local:    files under STORAGE_PUBLIC_DIR / STORAGE_PRIVATE_DIR (development, a VPS with a disk)
 *  - db:       the stored_files table — the default on Vercel, whose disk is temporary and per-instance
 *  - supabase: Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), for large photo volumes
 *  - s3 / r2:  Cloudflare R2 / AWS S3 compatible object storage (zero egress fees on R2)
 * Files are always served through our own routes, so URLs never change when the driver does.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getSql } from "@propertyx/database";
import { badRequest } from "./errors";

export type Visibility = "public" | "private";

function repoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "packages")) && existsSync(path.join(dir, "apps"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function baseDir(v: Visibility) {
  // serverless hosts (Vercel) only allow writes under /tmp, and it does not persist — configure a real store for production
  const fallback = process.env.VERCEL ? `/tmp/storage/${v}` : `./storage/${v}`;
  const configured = (v === "public" ? process.env.STORAGE_PUBLIC_DIR : process.env.STORAGE_PRIVATE_DIR) ?? fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(repoRoot(), configured);
}

function safeKey(key: string) {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw badRequest("Invalid storage key");
  return key;
}

type Driver = "local" | "db" | "supabase" | "s3" | "r2";
export function storageDriver(): Driver {
  const d = (process.env.STORAGE_DRIVER ?? "").toLowerCase();
  if ((d === "s3" || d === "r2") && process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID) return d as Driver;
  if (d === "supabase" && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  if (d === "db") return "db";
  // a local disk can't hold uploads on Vercel (temporary, not shared between instances)
  if (process.env.VERCEL) return "db";
  return "local";
}

/* --- Cloudflare R2 / AWS S3 Storage (SigV4 signing, zero extra dependencies) --- */
function s3Signer(opts: {
  method: string;
  url: URL;
  body?: Buffer;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  headers?: Record<string, string>;
}) {
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(opts.body ?? Buffer.alloc(0)).digest("hex");

  const headers: Record<string, string> = {
    host: opts.url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(opts.headers ?? {}),
  };

  const sortedKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = [
    opts.method,
    opts.url.pathname,
    opts.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const kDate = createHmac("sha256", `AWS4${opts.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(opts.region).digest();
  const kService = createHmac("sha256", kRegion).update(service).digest();
  const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

async function s3Fetch(method: string, v: Visibility, key: string, body?: Buffer, contentType?: string) {
  const endpoint = (process.env.S3_ENDPOINT || "").replace(/\/$/, "");
  const bucket = process.env.S3_BUCKET || "propertyx-media";
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
  const objectPath = `/${bucket}/${v}/${key}`;
  const url = new URL(objectPath, endpoint);

  const reqHeaders: Record<string, string> = {};
  if (contentType) reqHeaders["content-type"] = contentType;

  const authHeaders = s3Signer({
    method,
    url,
    body,
    accessKeyId,
    secretAccessKey,
    region,
    headers: reqHeaders,
  });

  return fetch(url.toString(), {
    method,
    headers: authHeaders,
    body: body ? new Uint8Array(body) : undefined,
  });
}

/* --- Supabase Storage (private buckets; we serve the files ourselves) --- */
const sbBucket = (v: Visibility) => (v === "public" ? "media" : "private");
async function sb(pathname: string, init: RequestInit = {}) {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${base}/storage/v1/${pathname}`, { ...init, headers: { authorization: `Bearer ${key}`, apikey: key, ...(init.headers ?? {}) } });
}
let bucketsReady: Promise<void> | null = null;
function ensureBuckets() {
  bucketsReady ??= Promise.all(
    (["public", "private"] as const).map((v) => sb("bucket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sbBucket(v), name: sbBucket(v), public: false }) }).then(() => {})),
  ).then(() => {});
  return bucketsReady;
}

export async function putFile(v: Visibility, key: string, data: Buffer) {
  safeKey(key);
  const driver = storageDriver();
  if (driver === "s3" || driver === "r2") {
    const r = await s3Fetch("PUT", v, key, data, "application/octet-stream");
    if (!r.ok) throw new Error(`S3/R2 Upload failed (${r.status})`);
  } else if (driver === "db") {
    await getSql()`insert into stored_files (key, visibility, data, size_bytes) values (${key}, ${v}, ${data}, ${data.length})
      on conflict (key) do update set data = excluded.data, size_bytes = excluded.size_bytes, visibility = excluded.visibility`;
  } else if (driver === "supabase") {
    await ensureBuckets();
    const r = await sb(`object/${sbBucket(v)}/${key}`, { method: "POST", headers: { "x-upsert": "true", "content-type": "application/octet-stream" }, body: new Uint8Array(data) });
    if (!r.ok) throw new Error(`Upload failed (${r.status})`);
  } else {
    const file = path.join(baseDir(v), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return { key, url: v === "public" ? `/media/${key}` : null };
}

export async function getFile(v: Visibility, key: string): Promise<Buffer> {
  safeKey(key);
  const driver = storageDriver();
  if (driver === "s3" || driver === "r2") {
    const r = await s3Fetch("GET", v, key);
    if (!r.ok) throw Object.assign(new Error("File not found"), { code: "ENOENT" });
    return Buffer.from(await r.arrayBuffer());
  }
  if (driver === "db") {
    const rows = await getSql()<{ data: Buffer }[]>`select data from stored_files where key = ${key} and visibility = ${v}`;
    if (!rows[0]) throw Object.assign(new Error("File not found"), { code: "ENOENT" });
    return Buffer.from(rows[0].data);
  }
  if (driver === "supabase") {
    const r = await sb(`object/${sbBucket(v)}/${key}`);
    if (!r.ok) throw Object.assign(new Error("File not found"), { code: "ENOENT" });
    return Buffer.from(await r.arrayBuffer());
  }
  return readFile(path.join(baseDir(v), key));
}

export async function fileExists(v: Visibility, key: string) {
  try {
    if (storageDriver() === "local") await stat(path.join(baseDir(v), safeKey(key)));
    else await getFile(v, key);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(v: Visibility, key: string) {
  try {
    safeKey(key);
    const driver = storageDriver();
    if (driver === "s3" || driver === "r2") await s3Fetch("DELETE", v, key);
    else if (driver === "db") await getSql()`delete from stored_files where key = ${key}`;
    else if (driver === "supabase") await sb(`object/${sbBucket(v)}/${key}`, { method: "DELETE" });
    else await unlink(path.join(baseDir(v), key));
  } catch {
    /* already gone */
  }
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const ATTACHMENT_TYPES = [...DOCUMENT_TYPES, "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4"];
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_DOC_BYTES = 15 * 1024 * 1024;

/** Detect real file type from magic bytes (never trust the client's content-type). */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 12).toString().startsWith("ftypavif")) return "image/avif";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  if (buf.subarray(0, 4).toString() === "OggS") return "audio/ogg";
  if (buf.subarray(0, 3).toString() === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (buf.subarray(4, 8).toString() === "ftyp") return "audio/mp4";
  return null;
}

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

/** 64-bit average hash for near-duplicate image detection. */
export async function averageHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).rotate().resize(8, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  const avg = px.reduce((s, v) => s + v, 0) / px.length;
  let bits = 0n;
  for (let i = 0; i < 64; i++) if (px[i] >= avg) bits |= 1n << BigInt(i);
  return bits.toString(16).padStart(16, "0");
}

export function hammingHex(a: string, b: string) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/**
 * Validates, strips EXIF (privacy: removes GPS from phones), resizes to max 2000px
 * and re-encodes as WebP. Returns hashes for duplicate detection.
 */
export async function storeImage(buf: Buffer, folder: string) {
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest("Image is larger than 12 MB");
  const mime = sniffMime(buf);
  if (!mime || !IMAGE_TYPES.includes(mime)) throw badRequest("Unsupported image type. Use JPG, PNG or WebP.");
  const img = sharp(buf, { failOn: "error" }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height || meta.width < 300 || meta.height < 200) throw badRequest("Image is too small (minimum 300×200).");
  const out = await img.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.webp`;
  const saved = await putFile("public", key, out.data);
  return { ...saved, width: out.info.width, height: out.info.height, sizeBytes: out.data.length, sha256: sha256(buf), perceptualHash: await averageHash(buf) };
}

export async function storePrivate(buf: Buffer, folder: string, allowed = DOCUMENT_TYPES) {
  if (buf.length > MAX_DOC_BYTES) throw badRequest("File is larger than 15 MB");
  const mime = sniffMime(buf);
  if (!mime || !allowed.includes(mime)) throw badRequest("Unsupported file type. Use PDF, JPG or PNG.");
  const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1];
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await putFile("private", key, buf);
  return { key, mime, sizeBytes: buf.length, sha256: sha256(buf) };
}

export async function storeAttachment(buf: Buffer, folder: string) {
  if (buf.length > MAX_DOC_BYTES) throw badRequest("File is larger than 15 MB");
  const mime = sniffMime(buf);
  if (!mime || !ATTACHMENT_TYPES.includes(mime)) throw badRequest("Unsupported attachment type.");
  let data = buf;
  let finalMime = mime;
  if (IMAGE_TYPES.includes(mime)) {
    // strip EXIF / GPS and normalise
    data = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    finalMime = "image/webp";
  }
  const ext = finalMime === "application/pdf" ? "pdf" : finalMime.split("/")[1];
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await putFile("private", key, data);
  // served only to conversation participants via /api/v1/attachments/<key>
  return { url: `/api/v1/attachments/${key}`, key, mime: finalMime, sizeBytes: data.length };
}
