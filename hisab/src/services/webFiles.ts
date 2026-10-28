/** Native builds share files through the system share sheet; see webFiles.web.ts for the browser. */
export class DownloadDeclined extends Error {}

export async function saveFileOnWeb(_filename: string, _data: string | Blob, _mimeType: string): Promise<boolean> {
  return false;
}

export async function htmlToPdfBlob(_html: string): Promise<Blob> {
  throw new Error('Not available on this platform');
}
