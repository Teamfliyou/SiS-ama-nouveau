import { useMemo, useState } from 'react';
import { BookOpen, GraduationCap, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import { toast } from '../../utils/toast';
import { useClasses, type ClassItem } from '../../hooks/useClasses';
import { useStudents } from '../../hooks/useStudents';
import { useTeachers } from '../../hooks/useTeachers';
import {
  EmptyState,
  GlassButton,
  GlassModal,
  GlassPanel,
  PageHeader,
  SearchField,
} from '../../components/liquid';

type Form = { name: string; tuitionFee: string };

export default function LiquidClasses() {
  const { classes, loading, create, update, remove } = useClasses();
  const { students } = useStudents();
  const { teachers } = useTeachers();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState<Form>({ name: '', tuitionFee: '0' });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ClassItem | null>(null);
  const [toDelete, setToDelete] = useState<ClassItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const teachersByClass = useMemo(() => {
    const map = new Map<number, string[]>();
    teachers.forEach((t) => {
      (t.classes ?? []).forEach((c) => {
        const list = map.get(c.id) ?? [];
        list.push(`${t.firstName} ${t.lastName}`);
        map.set(c.id, list);
      });
    });
    return map;
  }, [teachers]);

  const filtered = useMemo(() => {
    if (!search) return classes;
    const q = search.toLowerCase();
    return classes.filter((c) => c.name.toLowerCase().includes(q));
  }, [classes, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', tuitionFee: '0' });
    setFormOpen(true);
  };

  const openEdit = (cls: ClassItem) => {
    setEditing(cls);
    setForm({ name: cls.name, tuitionFee: String(cls.tuitionFee) });
    setDetail(null);
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const input = { name: form.name, tuitionFee: form.tuitionFee === '' ? 0 : Number(form.tuitionFee) };
      if (editing) {
        await update(editing.id, input);
        toast.success('Classe mise à jour');
      } else {
        await create(input);
        toast.success('Classe créée');
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await remove(toDelete.id);
      toast.success('Classe supprimée');
      setToDelete(null);
      setDetail(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const detailStudents = detail ? students.filter((s) => s.classId === detail.id) : [];
  const detailTeachers = detail ? teachersByClass.get(detail.id) ?? [] : [];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Classes"
        subtitle={`${classes.length} classe${classes.length > 1 ? 's' : ''}`}
        actions={
          <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Nouvelle classe
          </GlassButton>
        }
      />

      <SearchField value={search} onChange={setSearch} placeholder="Rechercher une classe…" ariaLabel="Rechercher une classe" className="max-w-md" />

      {loading ? (
        <p className="text-center text-sm text-slate-400 py-10">Chargement…</p>
      ) : filtered.length === 0 ? (
        <GlassPanel>
          <EmptyState
            icon={BookOpen}
            title={search ? 'Aucune classe trouvée' : 'Aucune classe créée'}
            description={search ? 'Essayez un autre nom.' : 'Créez votre première classe pour commencer.'}
            action={
              <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
                Nouvelle classe
              </GlassButton>
            }
          />
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cls) => {
            const profs = teachersByClass.get(cls.id) ?? [];
            return (
              <GlassPanel key={cls.id} className="lg-hover p-5 flex flex-col">
                <button type="button" onClick={() => setDetail(cls)} className="text-left flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-400 text-white flex items-center justify-center font-bold shadow-sm">
                      {cls.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="lg-badge">{cls._count.students} élève{cls._count.students > 1 ? 's' : ''}</span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-slate-900 truncate">{cls.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{formatCurrency(cls.tuitionFee)} / an</p>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5 truncate">
                    <GraduationCap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {profs.length > 0 ? profs.join(', ') : 'Aucun professeur'}
                  </p>
                </button>

                <div className="flex items-center justify-end gap-1.5 mt-4 pt-3 border-t border-white/60">
                  <button type="button" onClick={() => openEdit(cls)} className="lg-icon-btn" aria-label={`Modifier ${cls.name}`}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setToDelete(cls)} className="lg-icon-btn hover:text-rose-600" aria-label={`Supprimer ${cls.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}

      {/* Formulaire classe */}
      <GlassModal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Modifier la classe' : 'Nouvelle classe'} size="sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="lg-label" htmlFor="cl-name">Nom de la classe</label>
            <input id="cl-name" required placeholder="ex : 6ème A" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="lg-input" />
          </div>
          <div>
            <label className="lg-label" htmlFor="cl-fee">Frais de scolarité (€)</label>
            <input id="cl-fee" type="number" required step="0.01" value={form.tuitionFee} onChange={(e) => setForm((f) => ({ ...f, tuitionFee: e.target.value }))} className="lg-input" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton variant="ghost" onClick={() => setFormOpen(false)}>Annuler</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} icon={<Plus className="w-4 h-4" />}>
              {saving ? 'Enregistrement…' : editing ? 'Sauvegarder' : 'Créer'}
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Détail classe */}
      <GlassModal open={Boolean(detail)} onClose={() => setDetail(null)} size="md">
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-violet-500 to-fuchsia-400 text-white flex items-center justify-center font-bold text-lg">
                {detail.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="text-lg font-bold text-slate-900">{detail.name}</p>
                <p className="text-sm text-slate-400">
                  {detail._count.students} élève{detail._count.students > 1 ? 's' : ''} · {formatCurrency(detail.tuitionFee)} / an
                </p>
              </div>
            </div>

            <div>
              <p className="lg-section-title mb-1 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-slate-400" aria-hidden="true" /> Professeur(s)
              </p>
              <p className="text-sm text-slate-600">{detailTeachers.length > 0 ? detailTeachers.join(', ') : 'Aucun professeur assigné.'}</p>
            </div>

            <div>
              <p className="lg-section-title mb-2 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" aria-hidden="true" /> Élèves ({detailStudents.length})
              </p>
              {detailStudents.length === 0 ? (
                <p className="text-sm text-slate-400 bg-white/60 rounded-xl px-3 py-3">Aucun élève dans cette classe.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto rounded-xl bg-white/50">
                  {detailStudents.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="lg-avatar h-8 w-8 text-[11px]">{s.firstName[0]}{s.lastName[0]}</span>
                      <span className="text-sm text-slate-700 truncate">{s.firstName} <span className="uppercase">{s.lastName}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <GlassButton variant="ghost" icon={<Trash2 className="w-4 h-4" />} className="text-rose-600" onClick={() => setToDelete(detail)}>
                Supprimer
              </GlassButton>
              <GlassButton variant="primary" icon={<Pencil className="w-4 h-4" />} onClick={() => openEdit(detail)}>
                Modifier
              </GlassButton>
            </div>
          </div>
        )}
      </GlassModal>

      {/* Confirmation suppression */}
      <GlassModal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Supprimer la classe" size="sm">
        <p className="text-sm text-slate-600">
          Supprimer <strong>{toDelete?.name}</strong> ? Les élèves associés passeront « sans classe » et l'historique
          d'appel de cette classe sera supprimé.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <GlassButton variant="ghost" onClick={() => setToDelete(null)}>Annuler</GlassButton>
          <GlassButton variant="danger" disabled={deleting} icon={<Trash2 className="w-4 h-4" />} onClick={handleDelete}>
            {deleting ? 'Suppression…' : 'Supprimer'}
          </GlassButton>
        </div>
      </GlassModal>
    </div>
  );
}
