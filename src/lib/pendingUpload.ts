/**
 * Tiny in-memory handoff for files picked on the landing page hero before
 * navigating to /analyze. Client-side navigation (next/navigation) doesn't
 * reload the page, so this module-level variable survives the transition --
 * no sessionStorage/base64 round-trip needed for what is otherwise a plain
 * File object.
 */
let pendingFiles: File[] | null = null;

export function setPendingFiles(files: FileList | File[]) {
  pendingFiles = Array.from(files);
}

export function takePendingFiles(): File[] | null {
  const files = pendingFiles;
  pendingFiles = null;
  return files;
}
