// SVG is left out on purpose: served from our own origin, it could run scripts.
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function validateImageFile(file: File, maxSizeMB: number): { valid: boolean; error?: string } {
  if (!(file.type in IMAGE_EXTENSIONS)) {
    return { valid: false, error: 'Image must be a PNG, JPEG, WebP or GIF' };
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, error: `Image must be smaller than ${maxSizeMB}MB` };
  }

  return { valid: true };
}
