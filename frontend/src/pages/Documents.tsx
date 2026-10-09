import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, FolderOpen, Pencil, Save, Trash2, Upload, X } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import {
  ACCEPTED_FILES,
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_SIZE,
  canPreview,
  downloadDocument,
  formatDate,
  formatFileSize,
  openDocument,
  type DocumentCategory,
  type DocumentItem,
} from '../utils/documents';

const inputCls =
  'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl';
const card = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mobile:p-4';
const smallBtn =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50';

type Info = { title: string; category: DocumentCategory; description: string };
const emptyInfo: Info = { title: '', category: 'INFORMATION', description: '' };

/**
 * Documents: important files (règlement intérieur, informations essentielles…).
 * Administrators upload them, the whole team consults or downloads them; the
 * families will find them in their space later.
 */
export default function Documents() {
  const isAdmin = localStorage.getItem('role') === 'ADMIN';
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [info, setInfo] = useState<Info>(emptyInfo);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<{ id: number } & Info | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setDocs(await safeJson<DocumentItem[]>(await authFetch('/api/documents')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pickFile = (f: File | null) => {
    if (f && f.size > MAX_DOCUMENT_SIZE) {
      toast.error('Fichier trop volumineux (10 Mo maximum)');
      if (fileInput.current) fileInput.current.value = '';
      return setFile(null);
    }
    setFile(f);
    // The file name is a good default title.
    if (f && !info.title) setInfo((i) => ({ ...i, title: f.name.replace(/\.[^.]+$/, '') }));
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Choisissez un fichier');
    setUploading(true);
    try {
      const query = new URLSearchParams({ title: info.title, category: info.category, description: info.description, fileName: file.name });
      await safeJson(
        await authFetch(`/api/documents?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
      );
      toast.success('Document déposé');
      setInfo(emptyInfo);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const { id, ...body } = editing;
      await safeJson(await authFetch(`/api/documents/${id}`, { method: 'PUT', body: JSON.stringify(body) }));
      toast.success('Document mis à jour');
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async (d: DocumentItem) => {
    if (!window.confirm(`Supprimer le document « ${d.title} » ?`)) return;
    try {
      await safeJson(await authFetch(`/api/documents/${d.id}`, { method: 'DELETE' }));
      toast.success('Document supprimé');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const run = (action: () => Promise<void>) => action().catch((err) => toast.error(apiErrorMessage(err)));

  return (
    <div className="max-w-4xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Documents</h2>
        <p className="mt-2 text-sm text-slate-500">
          Les documents importants de l'association : règlement intérieur, informations essentielles… Ils seront aussi
          consultables par les familles dans leur espace, quand il sera ouvert.
        </p>
      </div>

      {isAdmin && (
        <form onSubmit={upload} className={`${card} space-y-4`}>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Upload className="w-5 h-5 text-primary" /> Déposer un document
          </h3>
          <label className="block text-sm font-medium text-slate-700">
            Fichier
            <input ref={fileInput} type="file" required accept={ACCEPTED_FILES} onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-primary file:font-semibold hover:file:bg-blue-100" />
            <span className="mt-1 block text-xs font-normal text-slate-400">PDF, image, Word, Excel ou OpenDocument · 10 Mo maximum</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-slate-700">
              Titre
              <input required maxLength={150} className={inputCls} value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })}
                placeholder="ex : Règlement intérieur 2026-2027" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Catégorie
              <select className={inputCls} value={info.category} onChange={(e) => setInfo({ ...info, category: e.target.value as DocumentCategory })}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(facultative)</span>
            <input maxLength={500} className={inputCls} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} />
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={uploading}
              className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 mobile:w-full mobile:justify-center mobile:min-h-[48px]">
              <Upload className="w-4 h-4" /> {uploading ? 'Envoi…' : 'Déposer'}
            </button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <FolderOpen className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Aucun document pour le moment.</p>
        </div>
      ) : (
        DOCUMENT_CATEGORIES.filter((c) => docs.some((d) => d.category === c.code)).map((c) => (
          <section key={c.code} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{c.label}</h3>
            <ul className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {docs.filter((d) => d.category === c.code).map((d) => (
                <li key={d.id} className="px-5 py-4 mobile:px-4">
                  {editing?.id === d.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input maxLength={150} className={inputCls} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label="Titre" />
                        <select className={inputCls} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as DocumentCategory })} aria-label="Catégorie">
                          {DOCUMENT_CATEGORIES.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                        </select>
                      </div>
                      <input maxLength={500} className={inputCls} value={editing.description} placeholder="Description"
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })} aria-label="Description" />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(null)} className={smallBtn}><X className="w-3.5 h-3.5" /> Annuler</button>
                        <button type="button" onClick={saveEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-blue-600">
                          <Save className="w-3.5 h-3.5" /> Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <FileText className="w-8 h-8 shrink-0 text-slate-300" />
                      <div className="flex-1 min-w-[12rem]">
                        <p className="text-sm font-semibold text-slate-900 break-words">{d.title}</p>
                        {d.description && <p className="text-xs text-slate-600 break-words">{d.description}</p>}
                        <p className="text-xs text-slate-400 break-all">
                          {d.fileName} · {formatFileSize(d.size)} · déposé le {formatDate(d.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canPreview(d.mimeType) && (
                          <button type="button" onClick={() => run(() => openDocument(d))} className={smallBtn}>
                            <Eye className="w-3.5 h-3.5" /> Consulter
                          </button>
                        )}
                        <button type="button" onClick={() => run(() => downloadDocument(d))} className={smallBtn}>
                          <Download className="w-3.5 h-3.5" /> Télécharger
                        </button>
                        {isAdmin && (
                          <>
                            <button type="button" title="Modifier" className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-primary hover:bg-slate-50"
                              onClick={() => setEditing({ id: d.id, title: d.title, category: d.category, description: d.description ?? '' })}>
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button type="button" title="Supprimer" onClick={() => remove(d)}
                              className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
