import { useMemo, useState } from 'react';
import { BookOpen, GraduationCap, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '../../utils/api';
import { toast } from '../../utils/toast';
import { useTeachers, type Teacher, type TeacherInput } from '../../hooks/useTeachers';
import { useClasses } from '../../hooks/useClasses';
import {
  EmptyState,
  GlassButton,
  GlassModal,
  GlassPanel,
  PageHeader,
  SearchField,
} from '../../components/liquid';

type Form = {
  firstName: string;
  lastName: string;
  subject: string;
  email: string;
  phone: string;
  classIds: number[];
};

const EMPTY: Form = { firstName: '', lastName: '', subject: '', email: '', phone: '', classIds: [] };

export default function LiquidTeachers() {
  const { teachers, loading, create, update, remove } = useTeachers();
  const { classes } = useClasses();

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Teacher | null>(null);
  const [toDelete, setToDelete] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return teachers;
    const q = search.toLowerCase();
    return teachers.filter(
      (t) =>
        t.firstName.toLowerCase().includes(q) ||
        t.lastName.toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  };

  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({
      firstName: t.firstName,
      lastName: t.lastName,
      subject: t.subject || '',
      email: t.email || '',
      phone: t.phone || '',
      classIds: (t.classes ?? []).map((c) => c.id),
    });
    setDetail(null);
    setFormOpen(true);
  };

  const toggleClass = (id: number) => {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter((c) => c !== id) : [...f.classIds, id],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const input: TeacherInput = {
        firstName: form.firstName,
        lastName: form.lastName,
        subject: form.subject || null,
        email: form.email || null,
        phone: form.phone || null,
        classId: form.classIds[0] ?? null,
        classIds: form.classIds,
      };
      if (editing) {
        await update(editing.id, input);
        toast.success('Professeur modifié');
      } else {
        await create(input);
        toast.success('Professeur ajouté');
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
      toast.success('Professeur supprimé');
      setToDelete(null);
      setDetail(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Professeurs"
        subtitle={`${teachers.length} professeur${teachers.length > 1 ? 's' : ''}`}
        actions={
          <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Ajouter un professeur
          </GlassButton>
        }
      />

      <SearchField value={search} onChange={setSearch} placeholder="Rechercher un professeur…" ariaLabel="Rechercher un professeur" className="max-w-md" />

      {loading ? (
        <p className="text-center text-sm text-slate-400 py-10">Chargement…</p>
      ) : filtered.length === 0 ? (
        <GlassPanel>
          <EmptyState
            icon={GraduationCap}
            title={search ? 'Aucun professeur trouvé' : 'Aucun professeur enregistré'}
            description={search ? 'Essayez un autre nom.' : 'Ajoutez les membres de votre équipe pédagogique.'}
            action={
              <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
                Ajouter un professeur
              </GlassButton>
            }
          />
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <GlassPanel key={t.id} className="lg-hover p-5 flex flex-col">
              <button type="button" onClick={() => setDetail(t)} className="text-left flex-1">
                <div className="flex items-center gap-3">
                  <span className="lg-avatar h-12 w-12 text-sm">
                    {t.firstName[0]}{t.lastName[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">
                      {t.firstName} <span className="uppercase">{t.lastName}</span>
                    </p>
                    {t.subject && <span className="lg-badge lg-badge-accent mt-1">{t.subject}</span>}
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                  {(t.classes ?? []).length > 0 ? (
                    <p className="flex items-center gap-2 truncate">
                      <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                      {(t.classes ?? []).map((c) => c.name).join(', ')}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-300 italic">Aucune classe assignée</p>
                  )}
                  {t.email && (
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-slate-300" aria-hidden="true" /> {t.email}
                    </p>
                  )}
                  {t.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-slate-300" aria-hidden="true" /> {t.phone}
                    </p>
                  )}
                </div>
              </button>
              <div className="flex items-center justify-end gap-1.5 mt-4 pt-3 border-t border-white/60">
                <button type="button" onClick={() => openEdit(t)} className="lg-icon-btn" aria-label={`Modifier ${t.firstName}`}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setToDelete(t)} className="lg-icon-btn hover:text-rose-600" aria-label={`Supprimer ${t.firstName}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {/* Formulaire professeur */}
      <GlassModal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Modifier le professeur' : 'Nouveau professeur'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="lg-label" htmlFor="t-first">Prénom</label>
              <input id="t-first" required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="lg-input" />
            </div>
            <div>
              <label className="lg-label" htmlFor="t-last">Nom</label>
              <input id="t-last" required value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="lg-input" />
            </div>
            <div>
              <label className="lg-label" htmlFor="t-subject">Matière</label>
              <input id="t-subject" placeholder="ex : Mathématiques" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="lg-input" />
            </div>
            <div>
              <label className="lg-label" htmlFor="t-email">Email</label>
              <input id="t-email" type="email" placeholder="prof@exemple.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="lg-input" />
            </div>
            <div className="sm:col-span-2">
              <label className="lg-label" htmlFor="t-phone">Téléphone</label>
              <input id="t-phone" type="tel" placeholder="+33 6 00 00 00 00" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="lg-input" />
            </div>
          </div>

          <div>
            <span className="lg-label">Classes assignées</span>
            {classes.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune classe disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => {
                  const active = form.classIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClass(c.id)}
                      aria-pressed={active}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                        active
                          ? 'bg-primary text-white border-transparent shadow-sm shadow-primary/25'
                          : 'bg-white/70 text-slate-600 border-white/80 hover:bg-white'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <GlassButton variant="ghost" onClick={() => setFormOpen(false)}>Annuler</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} icon={<Plus className="w-4 h-4" />}>
              {saving ? 'Enregistrement…' : editing ? 'Sauvegarder' : 'Ajouter'}
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Détail professeur */}
      <GlassModal open={Boolean(detail)} onClose={() => setDetail(null)} size="sm">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="lg-avatar h-14 w-14 text-lg">{detail.firstName[0]}{detail.lastName[0]}</span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-slate-900 truncate">
                  {detail.firstName} <span className="uppercase">{detail.lastName}</span>
                </p>
                {detail.subject && <span className="lg-badge lg-badge-accent mt-1">{detail.subject}</span>}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Classes</dt>
                <dd className="text-slate-700 text-right">{(detail.classes ?? []).map((c) => c.name).join(', ') || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Email</dt>
                <dd className="text-slate-700 text-right truncate">{detail.email || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Téléphone</dt>
                <dd className="text-slate-700 text-right">{detail.phone || '—'}</dd>
              </div>
            </dl>
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
      <GlassModal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Supprimer le professeur" size="sm">
        <p className="text-sm text-slate-600">
          Supprimer <strong>{toDelete?.firstName} {toDelete?.lastName}</strong> ?
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
