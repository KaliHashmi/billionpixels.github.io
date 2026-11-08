// Copies the PDF reader (pdf.js) and the text-recognition engine (Tesseract, with English and Arabic
// data) from node_modules into assets/ocr/ as .bin assets, so the app reads documents fully offline:
// nothing is downloaded from a CDN at run time. Runs after `npm install` (postinstall).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const FILES = {
  'pdf.mjs.bin': nm('pdfjs-dist/legacy/build/pdf.min.mjs'),
  'pdf.worker.mjs.bin': nm('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
  'tesseract.js.bin': nm('tesseract.js/dist/tesseract.min.js'),
  'tesseract.worker.js.bin': nm('tesseract.js/dist/worker.min.js'),
  'tesseract-core.wasm.js.bin': nm('tesseract.js-core/tesseract-core-lstm.wasm.js'),
  'eng.traineddata.gz.bin': nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
  'ara.traineddata.gz.bin': nm('@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz'),
};

const out = join(root, 'assets', 'ocr');
mkdirSync(out, { recursive: true });
for (const [name, from] of Object.entries(FILES)) copyFileSync(from, join(out, name));
console.log(`vendor-ocr: copied ${Object.keys(FILES).length} files to assets/ocr`);
