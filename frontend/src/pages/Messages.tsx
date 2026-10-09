import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Pencil, Pin, Send, Trash2, X } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { formatDate, type Announcement } from '../utils/documents';

const inputCls =
  'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl';
const card = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mobile:p-4';

/**
 * Messagerie: information posted by the administration. Administrators publish,
 * the whole team reads; the families will read it in their space later.
 */
export default function Messages() {
  const isAdmin = localStorage.getItem('role') === 'ADMIN';
  const [items, setItems] = useState<Announcement[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await safeJson<Announcement[]>(await authFetch('/api/announcements')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setPinned(false);
  };

  const edit = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await safeJson(
        await authFetch(editingId ? `/api/announcements/${editingId}` : '/api/announcements', {
          method: editingId ? 'PUT' : 'POST',
          body: JSON.stringify({ title, body, pinned }),
        })
      );
      toast.success(editingId ? 'Information mise à jour' : 'Information publiée');
      reset();
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Announcement) => {
    if (!window.confirm(`Retirer l'information « ${a.title} » ?`)) return;
    try {
      await safeJson(await authFetch(`/api/announcements/${a.id}`, { method: 'DELETE' }));
      toast.success('Information retirée');
      if (editingId === a.id) reset();
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Messagerie</h2>
        <p className="mt-2 text-sm text-slate-500">
          Les informations publiées par l'administration. Elles seront aussi visibles par les familles dans leur espace,
          quand il sera ouvert.
        </p>
      </div>

      {isAdmin && (
        <form onSubmit={save} className={`${card} space-y-4`}>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Megaphone className="w-5 h-5 text-primary" />
            {editingId ? "Modifier l'information" : 'Nouvelle information'}
          </h3>
          <label className="block text-sm font-medium text-slate-700">
            Titre
            <input required maxLength={150} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="ex : Reprise des cours samedi 13 septembre" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Message
            <textarea required maxLength={5000} rows={5} className={inputCls} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Le texte que les familles liront…" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="rounded border-slate-300" />
              Épingler en haut de la liste
            </label>
            <div className="flex gap-2 mobile:w-full">
              {editingId && (
                <button type="button" onClick={reset}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 mobile:flex-1 mobile:justify-center">
                  <X className="w-4 h-4" /> Annuler
                </button>
              )}
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 mobile:flex-1 mobile:justify-center mobile:min-h-[48px]">
                <Send className="w-4 h-4" /> {saving ? 'Publication…' : editingId ? 'Enregistrer' : 'Publier'}
              </button>
            </div>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <Megaphone className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Aucune information publiée pour le moment.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <li key={a.id} className={`${card} ${a.pinned ? 'border-amber-200 bg-amber-50/30' : ''} ${editingId === a.id ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                    {a.pinned && <Pin className="w-4 h-4 shrink-0 text-amber-500" aria-label="Épinglée" />}
                    <span className="break-words">{a.title}</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Publiée le {formatDate(a.createdAt)}
                    {a.updatedAt.slice(0, 16) !== a.createdAt.slice(0, 16) && <> · modifiée le {formatDate(a.updatedAt)}</>}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => edit(a)} title="Modifier"
                      className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-primary hover:bg-slate-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => remove(a)} title="Retirer"
                      className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-700 whitespace-pre-line break-words">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
