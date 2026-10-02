import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Built on first use rather than at import, so pages that import this module (and tests)
// load without storage credentials; only an actual upload, download, or delete needs them.
let cached: { client: S3Client; endpoint: string; bucket: string } | null = null;

function storage() {
  if (cached) return cached;
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error('File storage is not configured: set STORAGE_ENDPOINT and STORAGE_BUCKET.');
  }
  const region = endpoint.replace('https://s3.', '').replace('.backblazeb2.com', '');
  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: process.env.STORAGE_KEY_ID ?? '',
      secretAccessKey: process.env.STORAGE_KEY ?? '',
    },
  });
  cached = { client, endpoint, bucket };
  return cached;
}

const ALLOWED_TYPES = ['application/pdf', 'audio/mpeg', 'audio/mp3'];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export function validateSongFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only PDF and MP3 files are allowed.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, error: 'File must be 50 MB or smaller.' };
  }
  return { valid: true };
}

export async function uploadSongFile(file: File, ensembleId: string): Promise<string> {
  if (process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping upload of "${file.name}"`);
    return `https://storage.example.com/${ensembleId}/songs/${file.name}`;
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${ensembleId}/songs/${crypto.randomUUID()}-${sanitizedName}`;

  const buffer = await file.arrayBuffer();
  const { client, endpoint, bucket } = storage();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
    })
  );

  return `${endpoint}/${bucket}/${key}`;
}

export function keyFromUrl(url: string): string {
  const { endpoint, bucket } = storage();
  const prefix = `${endpoint}/${bucket}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

export async function deleteStorageFile(url: string): Promise<void> {
  if (process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping delete of "${url}"`);
    return;
  }

  const { client, bucket } = storage();
  const key = keyFromUrl(url);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getFileStream(
  url: string,
  range?: string
): Promise<{ body: ReadableStream; contentType: string; contentLength?: number; contentRange?: string; status: number }> {
  const { client, bucket } = storage();
  const key = keyFromUrl(url);
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: range })
  );

  if (!response.Body) throw new Error('Empty response from storage');

  return {
    body: response.Body.transformToWebStream(),
    contentType: response.ContentType ?? 'application/octet-stream',
    contentLength: response.ContentLength,
    contentRange: response.ContentRange,
    status: range ? 206 : 200,
  };
}
