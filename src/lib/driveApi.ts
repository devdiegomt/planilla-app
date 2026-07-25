/**
 * Descarga contenido de Drive files (server-side).
 * Soporta Google Docs (export a text/plain) y archivos binarios/texto (alt=media).
 * Rechaza silenciosamente los tipos no descargables (formularios, videos, links).
 */

import type { OAuth2Client } from 'google-auth-library';
import type { Attachment } from './classroomApi';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const MAX_BYTES = 300_000;              // ~300KB por archivo, ~75K tokens

/** Mimetypes de Google Workspace que se exportan a text/plain. */
const EXPORTABLE_TO_TEXT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.script': 'application/vnd.google-apps.script+json',
};

/** Extensiones tratadas como texto para archivos no-Workspace. */
const TEXT_LIKE_MIME = /^(text\/|application\/(json|xml|javascript|x-python|x-yaml))/;

export interface ExtractedFile {
  fileId: string;
  title: string;
  mimeType: string;
  text: string;                          // vacío si no se pudo extraer
  bytesFetched: number;
  skipped?: string;                      // razón si se saltó
}

async function driveGet(client: OAuth2Client, path: string, query?: Record<string, string>): Promise<Response> {
  const url = new URL(`${DRIVE_BASE}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const { token } = await client.getAccessToken();
  return fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
}

async function fetchFileMeta(client: OAuth2Client, fileId: string) {
  const res = await driveGet(client, `/files/${fileId}`, {
    fields: 'id,name,mimeType,size',
  });
  if (!res.ok) throw new Error(`Drive metadata ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return (await res.json()) as { id: string; name: string; mimeType: string; size?: string };
}

async function extractOne(client: OAuth2Client, fileId: string): Promise<ExtractedFile> {
  const meta = await fetchFileMeta(client, fileId);
  const base = {
    fileId: meta.id,
    title: meta.name,
    mimeType: meta.mimeType,
    bytesFetched: 0,
    text: '',
  };

  // Google Workspace: usar export
  const exportMime = EXPORTABLE_TO_TEXT[meta.mimeType];
  if (exportMime) {
    const res = await driveGet(client, `/files/${fileId}/export`, { mimeType: exportMime });
    if (!res.ok) {
      return { ...base, skipped: `export ${res.status}` };
    }
    const buf = await res.arrayBuffer();
    const truncated = buf.byteLength > MAX_BYTES;
    const text = new TextDecoder('utf-8').decode(buf.slice(0, MAX_BYTES));
    return {
      ...base,
      text: truncated ? text + '\n[... contenido truncado ...]' : text,
      bytesFetched: Math.min(buf.byteLength, MAX_BYTES),
    };
  }

  // Archivos texto-like: alt=media
  if (TEXT_LIKE_MIME.test(meta.mimeType)) {
    const res = await driveGet(client, `/files/${fileId}`, { alt: 'media' });
    if (!res.ok) {
      return { ...base, skipped: `download ${res.status}` };
    }
    const buf = await res.arrayBuffer();
    const truncated = buf.byteLength > MAX_BYTES;
    const text = new TextDecoder('utf-8').decode(buf.slice(0, MAX_BYTES));
    return {
      ...base,
      text: truncated ? text + '\n[... contenido truncado ...]' : text,
      bytesFetched: Math.min(buf.byteLength, MAX_BYTES),
    };
  }

  return { ...base, skipped: `tipo no soportado: ${meta.mimeType}` };
}

/**
 * Dado un array de attachments de Classroom, descarga el contenido de cada
 * driveFile soportado y devuelve un texto concatenado.
 */
export async function extractAttachmentsText(
  client: OAuth2Client,
  attachments: Attachment[],
): Promise<{ text: string; files: ExtractedFile[] }> {
  const results: ExtractedFile[] = [];
  const chunks: string[] = [];

  for (const att of attachments) {
    const drive = att.driveFile;
    if (!drive?.id) continue;

    try {
      const extracted = await extractOne(client, drive.id);
      results.push(extracted);
      if (extracted.text) {
        chunks.push(`=== ${extracted.title} (${extracted.mimeType}) ===\n${extracted.text}`);
      } else if (extracted.skipped) {
        chunks.push(`=== ${extracted.title} ===\n[No extraído: ${extracted.skipped}]`);
      }
    } catch (e) {
      results.push({
        fileId: drive.id,
        title: drive.title ?? drive.id,
        mimeType: 'unknown',
        text: '',
        bytesFetched: 0,
        skipped: (e as Error).message,
      });
    }
  }

  return {
    text: chunks.join('\n\n'),
    files: results,
  };
}
