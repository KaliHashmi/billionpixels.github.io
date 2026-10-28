/**
 * Browser-only file output. Inside the claude.ai preview the page may not download or
 * print on its own, so files go through the host's `downloads` capability, which asks
 * the viewer to confirm the save. Outside it, a normal browser download is used.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface HostDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

let hostDownloads: Promise<HostDownloads | null> | undefined;

function embedded(): boolean {
  return typeof window !== 'undefined' && window.top !== window.self;
}

function getHostDownloads(): Promise<HostDownloads | null> {
  if (!hostDownloads) {
    const host = typeof window !== 'undefined' ? window.claude : undefined;
    hostDownloads = host ? (host.use('downloads') as Promise<HostDownloads | null>).catch(() => null) : Promise.resolve(null);
  }
  return hostDownloads;
}

export class DownloadDeclined extends Error {}

/** Returns false when this browser view cannot save files at all. */
export async function saveFileOnWeb(filename: string, data: string | Blob, mimeType: string): Promise<boolean> {
  if (embedded()) {
    const downloads = await getHostDownloads();
    if (!downloads) return false;
    try {
      await downloads.save({ filename, data });
      return true;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') throw new DownloadDeclined();
      if (code === 'rate_limited') throw new Error('Another download is waiting for confirmation.');
      return false;
    }
  }
  const blob = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Render a full HTML document to an A4 PDF (text is rasterised, which keeps Arabic shaping intact). */
export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const frame = document.createElement('iframe');
  // A4 at 96 dpi is 794px wide.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:10px;border:0;visibility:hidden';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((r) => setTimeout(r, 50));
    if (doc.fonts?.ready) await doc.fonts.ready;
    const body = doc.body;
    body.style.background = '#ffffff';
    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: 794,
      width: 794,
      // The frame is only 10px tall, so the document height is the content height.
      height: doc.documentElement.scrollHeight,
      logging: false,
    });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const pxPerPage = Math.floor((canvas.width * pageH) / pageW);
    for (let y = 0, page = 0; y < canvas.height; y += pxPerPage, page++) {
      const sliceH = Math.min(pxPerPage, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, (sliceH * pageW) / canvas.width);
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

/** Read an image file as a PNG data URI, scaled down so it stays small enough to store. */
export function imageToDataUri(file: Blob, maxSide = 700): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * k));
      canvas.height = Math.max(1, Math.round(img.height * k));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not an image Hisab can read. Use a PNG or JPG.'));
    };
    img.src = url;
  });
}
