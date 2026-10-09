// Documents and Messagerie: shared types and helpers.
import { authFetch, ApiError, safeJson } from './api';

export type Announcement = {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { email: string } | null;
};

export type DocumentCategory = 'REGLEMENT' | 'INFORMATION' | 'AUTRE';

export type DocumentItem = {
  id: number;
  title: string;
  description: string | null;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { email: string } | null;
};

export const DOCUMENT_CATEGORIES: { code: DocumentCategory; label: string }[] = [
  { code: 'REGLEMENT', label: 'Règlement intérieur' },
  { code: 'INFORMATION', label: 'Informations essentielles' },
  { code: 'AUTRE', label: 'Autres documents' },
];

/** Same limit and formats as the server. */
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
export const ACCEPTED_FILES = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.odt';

/** 2_400_000 -> "2,3 Mo", 52_000 -> "51 Ko". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} Mo`;
}

/** "2026-10-09T10:00:00Z" -> "9 octobre 2026". */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Files a browser can show itself (others are downloaded). */
export const canPreview = (mimeType: string) => mimeType === 'application/pdf' || mimeType.startsWith('image/');

async function fetchFile(doc: DocumentItem): Promise<string> {
  const res = await authFetch(`/api/documents/${doc.id}/file`);
  if (!res.ok) await safeJson(res); // throws the server's message
  const blob = await res.blob();
  return URL.createObjectURL(new Blob([blob], { type: doc.mimeType }));
}

/** Opens a document in a new tab (PDF, images). */
export async function openDocument(doc: DocumentItem): Promise<void> {
  // Opened right away (inside the click) so the browser does not block it.
  const tab = window.open('', '_blank');
  try {
    const url = await fetchFile(doc);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err instanceof ApiError ? err : new Error("Impossible d'ouvrir le document");
  }
}

/** Downloads a document under its file name. */
export async function downloadDocument(doc: DocumentItem): Promise<void> {
  const url = await fetchFile(doc);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
