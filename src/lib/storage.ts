import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  NoSuchKey,
} from '@aws-sdk/client-s3';
import { IMAGE_EXTENSIONS } from './upload';

// Song files live in a Tigris bucket. `fly storage create -a <app>` sets these variables on the
// app; the SDK also reads AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from the environment.
// Built on first use rather than at import, so pages that import this module (and tests)
// load without storage credentials; only an actual upload, download, or delete needs them.
let cached: { client: S3Client; bucket: string } | null = null;

function storage() {
  if (cached) return cached;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const bucket = process.env.BUCKET_NAME;
  if (!endpoint || !bucket) {
    throw new Error('File storage is not configured: set AWS_ENDPOINT_URL_S3 and BUCKET_NAME.');
  }
  const client = new S3Client({ endpoint, region: process.env.AWS_REGION ?? 'auto' });
  cached = { client, bucket };
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

async function putFile(key: string, file: File): Promise<void> {
  if (process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping upload of "${file.name}"`);
    return;
  }

  const buffer = await file.arrayBuffer();
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
    })
  );
}

/** Uploads a song file and returns its object key, which is what SongFile.url stores. */
export async function uploadSongFile(file: File, ensembleId: string): Promise<string> {
  return uploadEnsembleFile(file, ensembleId, 'songs');
}

/** Uploads an arrangement version and returns its object key, which is what ArrangementVersion.url stores. */
export async function uploadArrangementFile(file: File, ensembleId: string): Promise<string> {
  return uploadEnsembleFile(file, ensembleId, 'arrangements');
}

async function uploadEnsembleFile(file: File, ensembleId: string, folder: string): Promise<string> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${ensembleId}/${folder}/${crypto.randomUUID()}-${sanitizedName}`;
  await putFile(key, file);
  return key;
}

/**
 * Duplicate a stored object so the copy has an independent lifecycle. Used when
 * an arrangement is adopted into the library: the song's file and the
 * arrangement's version history must survive each other's deletion.
 */
export async function copyStorageFile(key: string, ensembleId: string, folder: string): Promise<string> {
  const fileName = key.split('/').pop() ?? 'file';
  const destinationKey = `${ensembleId}/${folder}/${crypto.randomUUID()}-${fileName}`;

  if (process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping copy of "${key}"`);
    return destinationKey;
  }

  const { client, bucket } = storage();
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: destinationKey,
    })
  );
  return destinationKey;
}

const IMAGE_PATH = /^\/images\/((?:avatars|ensembles)\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif))$/;

/**
 * Uploads an avatar or ensemble image that passed validateImageFile, and returns the path it's
 * served from (src/pages/images), which is what User.avatarUrl and Ensemble.imageUrl store.
 */
export async function uploadImage(file: File, kind: 'avatars' | 'ensembles'): Promise<string> {
  const key = `${kind}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type]}`;
  await putFile(key, file);
  return `/images/${key}`;
}

/**
 * The object key behind an image path, or null for anything else. Images uploaded before they
 * moved to storage are inline data URIs, which still render but have nothing to delete.
 */
export function imageKey(path: string): string | null {
  return IMAGE_PATH.exec(path)?.[1] ?? null;
}

/** Deletes a replaced or removed image. Failures are only logged: the database change already happened. */
export async function deleteImage(path: string | null | undefined): Promise<void> {
  const key = path ? imageKey(path) : null;
  if (!key) return;
  try {
    await deleteStorageFile(key);
  } catch (error) {
    console.error(`[storage] failed to delete image "${key}":`, error);
  }
}

export async function deleteStorageFile(key: string): Promise<void> {
  if (process.env.STORAGE_DISABLED) {
    console.log(`[storage] disabled — skipping delete of "${key}"`);
    return;
  }

  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Streams an object, or returns null if it doesn't exist. */
export async function getFileStream(
  key: string,
  range?: string
): Promise<{ body: ReadableStream; contentType: string; contentLength?: number; contentRange?: string; status: number } | null> {
  const { client, bucket } = storage();
  let response;
  try {
    response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }

  if (!response.Body) throw new Error('Empty response from storage');

  return {
    body: response.Body.transformToWebStream(),
    contentType: response.ContentType ?? 'application/octet-stream',
    contentLength: response.ContentLength,
    contentRange: response.ContentRange,
    status: range ? 206 : 200,
  };
}
