import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { AppState } from '../domain/types';
import { notify } from '../ui/dialog';

import { DownloadDeclined, htmlToPdfBlob, saveFileOnWeb } from './webFiles';

/** Shown when a browser view cannot save files at all. */
function webUnavailable() {
  notify('PDF / Print / Export', 'Downloads are not available in this browser view. They work in the iPhone and Android app.\nالتنزيل غير متاح في هذا المتصفح، وهو متاح في تطبيق آيفون وأندرويد.');
}

async function saveOnWeb(filename: string, data: string | Blob, mimeType: string): Promise<void> {
  try {
    if (!(await saveFileOnWeb(filename, data, mimeType))) webUnavailable();
  } catch (e) {
    if (!(e instanceof DownloadDeclined)) throw e;
  }
}

function pdfName(filename: string) {
  return filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
}

/** Save a text file and open the system share sheet (email, Drive, Files…). */
export async function shareTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    // A byte-order mark lets Excel open UTF-8 (Arabic) CSV files correctly.
    await saveOnWeb(filename, mimeType === 'text/csv' ? `\uFEFF${content}` : content, mimeType);
    return;
  }
  const file = new File(Paths.cache, filename);
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

export async function sharePdf(html: string, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    await saveOnWeb(pdfName(filename), await htmlToPdfBlob(html), 'application/pdf');
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, pdfName(filename));
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
}

export async function printHtml(html: string, filename = 'Document'): Promise<void> {
  // Embedded previews (iframes) cannot open the print dialog: hand over a PDF to print instead.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.top !== window.self) {
    await sharePdf(html, filename);
    return;
  }
  await Print.printAsync({ html });
}

/** Let the user pick a text file (JSON backup, CSV statement). Returns null if cancelled. */
export async function pickTextFile(types: string[]): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (res.canceled || !res.assets.length) return null;
  const asset = res.assets[0];
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text();
    return (await fetch(asset.uri)).text();
  }
  return new File(asset.uri).text();
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

// ---- Backups ----

interface BackupFile {
  app: 'hisab';
  format: 1;
  exportedAt: string;
  state: AppState;
}

export function makeBackup(state: AppState): string {
  const file: BackupFile = { app: 'hisab', format: 1, exportedAt: new Date().toISOString(), state };
  return JSON.stringify(file);
}

export function readBackup(text: string): AppState {
  let parsed: Partial<BackupFile>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid Hisab backup.');
  }
  if (parsed.app !== 'hisab' || !parsed.state?.settings || !Array.isArray(parsed.state.accounts)) {
    throw new Error('This file is not a valid Hisab backup.');
  }
  return parsed.state;
}
