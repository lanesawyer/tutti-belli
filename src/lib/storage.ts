import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

const endpoint = (import.meta.env.STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT) as string;
const region = endpoint.replace('https://s3.', '').replace('.backblazeb2.com', '');
const bucket = (import.meta.env.STORAGE_BUCKET ?? process.env.STORAGE_BUCKET) as string;

const client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: (import.meta.env.STORAGE_KEY_ID ?? process.env.STORAGE_KEY_ID) as string,
    secretAccessKey: (import.meta.env.STORAGE_KEY ?? process.env.STORAGE_KEY) as string,
  },
});

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
  return uploadEnsembleFile(file, ensembleId, 'songs');
}

export async function uploadArrangementFile(file: File, ensembleId: string): Promise<string> {
  return uploadEnsembleFile(file, ensembleId, 'arrangements');
}

async function uploadEnsembleFile(file: File, ensembleId: string, folder: string): Promise<string> {
  if (import.meta.env.STORAGE_DISABLED ?? process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping upload of "${file.name}"`);
    return `https://storage.example.com/${ensembleId}/${folder}/${file.name}`;
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${ensembleId}/${folder}/${crypto.randomUUID()}-${sanitizedName}`;

  const buffer = await file.arrayBuffer();

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

/**
 * Duplicate a stored object so the copy has an independent lifecycle. Used when
 * an arrangement is adopted into the library: the song's file and the
 * arrangement's version history must survive each other's deletion.
 */
export async function copyStorageFile(url: string, ensembleId: string, folder: string): Promise<string> {
  if (import.meta.env.STORAGE_DISABLED ?? process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping copy of "${url}"`);
    return url;
  }

  const sourceKey = keyFromUrl(url);
  const fileName = sourceKey.split('/').pop() ?? 'file';
  const destinationKey = `${ensembleId}/${folder}/${crypto.randomUUID()}-${fileName}`;

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destinationKey,
    })
  );

  return `${endpoint}/${bucket}/${destinationKey}`;
}

export function keyFromUrl(url: string): string {
  const prefix = `${endpoint}/${bucket}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

export async function deleteStorageFile(url: string): Promise<void> {
  if (import.meta.env.STORAGE_DISABLED ?? process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping delete of "${url}"`);
    return;
  }

  const key = keyFromUrl(url);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getFileStream(
  url: string,
  range?: string
): Promise<{ body: ReadableStream; contentType: string; contentLength?: number; contentRange?: string; status: number }> {
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
