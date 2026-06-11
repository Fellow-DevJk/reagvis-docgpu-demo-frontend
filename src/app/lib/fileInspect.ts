import { CheckId, CheckResult } from '../types';

// Only the 5 integrity checks are computed from the real uploaded File.
// All readability / quality / authenticity results come from the active scenario.

export async function inspectFile(
  file: File,
  maxFileMB = 10,
): Promise<Partial<Record<CheckId, CheckResult>>> {
  const out: Partial<Record<CheckId, CheckResult>> = {};
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const sizeMB = file.size / (1024 * 1024);

  // ── fileSize ────────────────────────────────────────────────────────────────
  if (sizeMB > maxFileMB) {
    out.fileSize = {
      id: 'fileSize', status: 'fail',
      metric: `${sizeMB.toFixed(1)} MB / ${maxFileMB} MB`,
      barPct: Math.min(100, Math.round((sizeMB / maxFileMB) * 100)),
      reason: `${sizeMB.toFixed(1)} MB — exceeds ${maxFileMB} MB limit`,
      rawScore: sizeMB,
    };
  } else {
    out.fileSize = {
      id: 'fileSize', status: 'pass',
      metric: `${sizeMB.toFixed(1)} MB / ${maxFileMB} MB`,
      barPct: Math.round((sizeMB / maxFileMB) * 100),
      rawScore: sizeMB,
    };
  }

  // ── allowedFormat ───────────────────────────────────────────────────────────
  const allowed = ['pdf', 'jpg', 'jpeg', 'png'];
  if (!allowed.includes(ext)) {
    out.allowedFormat = {
      id: 'allowedFormat', status: 'fail',
      metric: `${ext.toUpperCase()} not allowed`,
      reason: `${ext.toUpperCase()} not allowed (PDF, JPG, PNG only)`,
    };
  } else {
    out.allowedFormat = {
      id: 'allowedFormat', status: 'pass',
      metric: `${ext.toUpperCase()} — accepted`,
    };
  }

  // ── read magic bytes ────────────────────────────────────────────────────────
  const headerBytes = await readBytes(file, 0, 8);
  const detectedMime = sniffMime(headerBytes);

  // ── extMimeMatch ────────────────────────────────────────────────────────────
  const declaredMime = extToMime(ext);
  if (!detectedMime) {
    out.extMimeMatch = {
      id: 'extMimeMatch', status: 'warn',
      metric: 'Type unverifiable',
      reason: 'Could not detect MIME from file bytes',
    };
  } else if (declaredMime && detectedMime !== declaredMime) {
    out.extMimeMatch = {
      id: 'extMimeMatch', status: 'fail',
      metric: `.${ext} declared, detected ${detectedMime}`,
      reason: `.${ext} declared, MIME is ${detectedMime} — mismatch`,
    };
  } else {
    out.extMimeMatch = {
      id: 'extMimeMatch', status: 'pass',
      metric: `.${ext} matches ${detectedMime ?? declaredMime}`,
    };
  }

  // ── corruption ──────────────────────────────────────────────────────────────
  out.corruption = await checkCorruption(file, detectedMime, headerBytes);

  // ── encryption (PDF only) ───────────────────────────────────────────────────
  out.encryption = await checkEncryption(file, detectedMime);

  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function readBytes(file: File, start: number, len: number): Promise<Uint8Array> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Uint8Array(e.target!.result as ArrayBuffer));
    reader.readAsArrayBuffer(file.slice(start, start + len));
  });
}

async function readText(file: File, start: number, len: number): Promise<string> {
  const bytes = await readBytes(file, start, len);
  return new TextDecoder('latin1').decode(bytes);
}

function sniffMime(b: Uint8Array): string | null {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)                   return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)  return 'image/png';
  return null;
}

function extToMime(ext: string): string | null {
  if (ext === 'pdf')             return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png')             return 'image/png';
  return null;
}

async function checkCorruption(
  file: File,
  mime: string | null,
  header: Uint8Array,
): Promise<CheckResult> {
  const bad: CheckResult = {
    id: 'corruption', status: 'fail',
    metric: 'Truncated byte stream',
    reason: 'Truncated byte stream — unreadable',
  };
  const good: CheckResult = { id: 'corruption', status: 'pass', metric: 'Structure intact, readable' };

  if (mime === 'application/pdf') {
    const hasPDFHeader = header[0] === 0x25 && header[1] === 0x50;
    const tailLen = Math.min(file.size, 1024);
    const tail = await readText(file, Math.max(0, file.size - tailLen), tailLen);
    const hasEOF = tail.includes('%%EOF');
    return hasPDFHeader && hasEOF ? good : bad;
  }

  if (mime === 'image/jpeg' || mime === 'image/png') {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      return good;
    } catch {
      return bad;
    }
  }

  return good;
}

async function checkEncryption(file: File, mime: string | null): Promise<CheckResult> {
  const good: CheckResult = { id: 'encryption', status: 'pass', metric: 'No encryption detected' };
  if (mime !== 'application/pdf') return good;

  const chunkSize = Math.min(file.size, 32768);
  const head = await readText(file, 0, chunkSize);
  const tail = await readText(file, Math.max(0, file.size - chunkSize), chunkSize);

  if (head.includes('/Encrypt') || tail.includes('/Encrypt')) {
    return {
      id: 'encryption', status: 'fail',
      metric: 'Password-protected',
      reason: 'Password-protected — contents unreadable',
    };
  }
  return good;
}
