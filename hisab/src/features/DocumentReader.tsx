'use dom';

// Reads the text of a PDF or photo on the device. PDFs that contain text are read directly (pdf.js);
// photos and scanned PDFs go through text recognition (Tesseract, English and Arabic). Everything is
// loaded from the app's own assets: no file or text ever leaves the device.
// Runs inside a web view on iOS and Android, and directly in the page on the web.
import { useEffect, useRef } from 'react';

export interface ReaderResult {
  text: string;
  /** First page as a JPEG data URI, kept as the receipt photo. */
  preview?: string;
  /** Whether text recognition was needed (photo or scanned PDF). */
  recognised: boolean;
}

interface Props {
  /** The file to read, as a data URI; null when idle. */
  source: { dataUri: string; mimeType: string } | null;
  onResult: (result: ReaderResult) => Promise<void>;
  onError: (message: string) => Promise<void>;
  onProgress: (step: 'reading' | 'recognising') => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const ASSETS = {
  pdf: require('../../assets/ocr/pdf.mjs.bin'),
  pdfWorker: require('../../assets/ocr/pdf.worker.mjs.bin'),
  tesseract: require('../../assets/ocr/tesseract.js.bin'),
  tesseractWorker: require('../../assets/ocr/tesseract.worker.js.bin'),
  core: require('../../assets/ocr/tesseract-core.wasm.js.bin'),
  eng: require('../../assets/ocr/eng.traineddata.gz.bin'),
  ara: require('../../assets/ocr/ara.traineddata.gz.bin'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const MAX_PAGES = 3;
const PREVIEW_SIDE = 1600;
const OCR_SIDE = 2000;

type Asset = string | { uri?: string; default?: string };
const assetUrl = (a: Asset): string => (typeof a === 'string' ? a : (a.uri ?? a.default ?? ''));

/** Load a bundled file. In a release build the web view reads it from file://, which fetch() may refuse; XMLHttpRequest can. */
async function bytes(a: Asset): Promise<Uint8Array<ArrayBuffer>> {
  const url = assetUrl(a);
  try {
    const res = await fetch(url);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    // Fall through to XMLHttpRequest.
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => (xhr.response ? resolve(new Uint8Array(xhr.response as ArrayBuffer)) : reject(new Error(`Could not load ${url}`)));
    xhr.onerror = () => reject(new Error(`Could not load ${url}`));
    xhr.send();
  });
}

const blobUrls = new Map<string, string>();
async function blobUrl(key: keyof typeof ASSETS, type: string): Promise<string> {
  if (!blobUrls.has(key)) blobUrls.set(key, URL.createObjectURL(new Blob([await bytes(ASSETS[key])], { type })));
  return blobUrls.get(key)!;
}

// A runtime import that the bundler leaves alone (the module comes from a blob URL).
const importModule = new Function('url', 'return import(url)') as (url: string) => Promise<any>;

let pdfjsPromise: Promise<any> | undefined;
function pdfjs() {
  pdfjsPromise ??= (async () => {
    const lib = await importModule(await blobUrl('pdf', 'text/javascript'));
    lib.GlobalWorkerOptions.workerSrc = await blobUrl('pdfWorker', 'text/javascript');
    return lib;
  })();
  return pdfjsPromise;
}

let tesseractPromise: Promise<any> | undefined;
function ocrWorker() {
  tesseractPromise ??= (async () => {
    const w = window as unknown as { Tesseract?: any };
    if (!w.Tesseract) {
      const src = await blobUrl('tesseract', 'text/javascript');
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Could not start text recognition.'));
        document.head.appendChild(s);
      });
    }
    // The engine fetches "<langPath>/<lang>.traineddata.gz"; inside its worker those requests are answered
    // from the bundled files (blob URLs), so nothing is downloaded.
    const data = { eng: await blobUrl('eng', 'application/gzip'), ara: await blobUrl('ara', 'application/gzip') };
    const prelude = `const __lang = ${JSON.stringify(data)}; const __fetch = self.fetch.bind(self);
self.fetch = (u, o) => { const m = /\\/(eng|ara)\\.traineddata\\.gz$/.exec(String(u)); return __fetch(m ? __lang[m[1]] : u, o); };\n`;
    const workerCode = new TextDecoder().decode(await bytes(ASSETS.tesseractWorker));
    const workerPath = URL.createObjectURL(new Blob([prelude, workerCode], { type: 'text/javascript' }));
    return w.Tesseract.createWorker(['eng', 'ara'], 1, {
      workerPath,
      workerBlobURL: false,
      langPath: 'https://offline.hisab/lang',
      // The engine picks a file by name; the fragment keeps the blob URL ending in ".js".
      corePath: `${await blobUrl('core', 'text/javascript')}#/tesseract-core-lstm.wasm.js`,
      cacheMethod: 'none',
    });
  })();
  return tesseractPromise;
}

function scaled(width: number, height: number, side: number) {
  const k = Math.min(1, side / Math.max(width, height));
  return { w: Math.round(width * k), h: Math.round(height * k) };
}

function toJpeg(canvas: HTMLCanvasElement): string {
  const { w, h } = scaled(canvas.width, canvas.height, PREVIEW_SIDE);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0, w, h);
  return out.toDataURL('image/jpeg', 0.6);
}

async function recognise(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await ocrWorker();
  const { data } = await worker.recognize(canvas);
  return data.text as string;
}

type TextItem = { str: string; dir: string; transform: number[]; width: number; height: number };

/**
 * Text of a PDF page, line by line. Pieces on the same baseline are put in reading order (right to left for
 * Arabic lines) and joined with a space only where the page shows a gap: many PDFs store Arabic one letter at a time.
 */
function pageText(items: TextItem[]): string {
  const rows = new Map<number, typeof items>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3);
    rows.set(y, [...(rows.get(y) ?? []), it]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => {
      const rtl = row.filter((i) => i.dir === 'rtl').length > row.length / 2;
      const ordered = row.sort((a, b) => (rtl ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]));
      let line = '';
      let prev: TextItem | undefined;
      for (const it of ordered) {
        if (prev) {
          const gap = rtl ? prev.transform[4] - (it.transform[4] + it.width) : it.transform[4] - (prev.transform[4] + prev.width);
          if (gap > Math.max(1, (it.height || 10) * 0.2)) line += ' ';
        }
        line += it.str;
        prev = it;
      }
      return line.trim();
    })
    .join('\n');
}

async function readPdf(data: Uint8Array, progress: Props['onProgress']): Promise<ReaderResult> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const texts: string[] = [];
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n);
    texts.push(pageText((await page.getTextContent()).items));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: OCR_SIDE / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    canvases.push(canvas);
  }
  let text = texts.join('\n');
  const recognised = text.replace(/\s/g, '').length < 20;
  if (recognised) {
    // A scanned PDF: the pages are pictures, so recognise the text in them.
    await progress('recognising');
    const parts: string[] = [];
    for (const c of canvases) parts.push(await recognise(c));
    text = parts.join('\n');
  }
  return { text, preview: canvases[0] ? toJpeg(canvases[0]) : undefined, recognised };
}

async function readImage(dataUri: string, progress: Props['onProgress']): Promise<ReaderResult> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not open the image'));
    img.src = dataUri;
  });
  const { w, h } = scaled(img.naturalWidth, img.naturalHeight, OCR_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  await progress('recognising');
  return { text: await recognise(canvas), preview: toJpeg(canvas), recognised: true };
}

export default function DocumentReader({ source, onResult, onError, onProgress }: Props) {
  // The file being (or last) read, so a re-render never reads it twice. Cleared when the parent clears `source`.
  const current = useRef<string | null>(null);
  useEffect(() => {
    if (!source) {
      current.current = null;
      return;
    }
    if (current.current === source.dataUri) return;
    current.current = source.dataUri;
    (async () => {
      try {
        await onProgress('reading');
        const result =
          source.mimeType === 'application/pdf'
            ? await readPdf(Uint8Array.from(atob(source.dataUri.split(',')[1]), (c) => c.charCodeAt(0)), onProgress)
            : await readImage(source.dataUri, onProgress);
        await onResult(result);
      } catch (e) {
        await onError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [source, onResult, onError, onProgress]);
  return <div data-testid="document-reader" style={{ width: 1, height: 1, overflow: 'hidden' }} />;
}
