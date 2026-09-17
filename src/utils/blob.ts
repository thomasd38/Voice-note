/**
 * Lecture d'un Blob en `ArrayBuffer`.
 *
 * `Blob.arrayBuffer()` n'existe pas partout (Safari < 14 notamment) : on
 * retombe alors sur `FileReader`, disponible depuis toujours.
 */
export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () =>
      reject(reader.error ?? new Error("L'enregistrement audio n'a pas pu être lu."));
    reader.readAsArrayBuffer(blob);
  });
}
