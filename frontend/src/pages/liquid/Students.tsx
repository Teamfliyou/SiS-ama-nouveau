import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  Filter,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import { toast } from '../../utils/toast';
import { useStudents, type Student, type StudentInput } from '../../hooks/useStudents';
import { useClasses } from '../../hooks/useClasses';
import {
  EmptyState,
  GlassButton,
  GlassModal,
  GlassPanel,
  PageHeader,
  SearchField,
} from '../../components/liquid';

const EMPTY_FORM: StudentInput = { firstName: '', lastName: '', phone: '', classId: null };

export default function LiquidStudents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { students, loading, create, update, remove } = useStudents();
  const { classes } = useClasses();

  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'class' | 'remaining'>('name');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Student | null>(null);
  const [toDelete, setToDelete] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Ouverture directe depuis une action rapide (/students?new=1)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      firstName: student.firstName,
      lastName: student.lastName,
      phone: student.phone ?? '',
      classId: student.classId,
    });
    setDetail(null);
    setFormOpen(true);
  }

  const filtered = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q)
      );
    }
    if (filterClass) {
      list =
        filterClass === '__none__'
          ? list.filter((s) => !s.classId)
          : list.filter((s) => s.classId === parseInt(filterClass));
    }
    if (filterStatus === 'paid') list = list.filter((s) => s.remaining <= 0);
    if (filterStatus === 'unpaid') list = list.filter((s) => s.remaining > 0);

    list.sort((a, b) => {
      if (sortBy === 'name') return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
      if (sortBy === 'class') return (a.class?.name || '').localeCompare(b.class?.name || '');
      return b.remaining - a.remaining;
    });
    return list;
  }, [students, search, filterClass, filterStatus, sortBy]);

  const hasFilters = Boolean(search || filterClass || filterStatus || sortBy !== 'name');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, form);
        toast.success('Élève modifié');
      } else {
        await create(form);
        toast.success('Élève inscrit');
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
      toast.success('Élève supprimé');
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
        title="Élèves"
        subtitle={`${students.length} élève${students.length > 1 ? 's' : ''} au registre`}
        actions={
          <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Nouvel élève
          </GlassButton>
        }
      />

      {/* Filtres */}
      <GlassPanel className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un élève…"
            ariaLabel="Rechercher un élève"
            className="flex-1"
          />
          <div className="flex items-center gap-2 text-slate-400 shrink-0">
            <Filter className="w-4 h-4" aria-hidden="true" />
            <span className="text-xs font-semibold">Filtres</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="lg-select w-auto" aria-label="Filtrer par classe">
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="__none__">Sans classe</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="lg-select w-auto" aria-label="Filtrer par situation">
            <option value="">Toutes situations</option>
            <option value="paid">Entièrement payé</option>
            <option value="unpaid">Solde restant</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="lg-select w-auto" aria-label="Trier">
            <option value="name">Trier par nom</option>
            <option value="class">Trier par classe</option>
            <option value="remaining">Trier par solde</option>
          </select>
          <span className="ml-auto text-xs font-semibold text-slate-400">
            {filtered.length} / {students.length}
          </span>
        </div>
      </GlassPanel>

      {/* Liste */}
      <GlassPanel className="overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-400">Chargement…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? 'Aucun élève ne correspond aux filtres' : 'Aucun élève inscrit'}
            description={hasFilters ? 'Essayez de modifier ou de réinitialiser vos filtres.' : 'Commencez par inscrire un élève.'}
            action={
              hasFilters ? (
                <GlassButton
                  onClick={() => {
                    setSearch('');
                    setFilterClass('');
                    setFilterStatus('');
                    setSortBy('name');
                  }}
                >
                  Réinitialiser les filtres
                </GlassButton>
              ) : (
                <GlassButton variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={openCreate}>
                  Inscrire un élève
                </GlassButton>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100/70">
            {filtered.map((st) => {
              const progress = st.totalAmountDue > 0 ? Math.min(100, (st.totalPaid / st.totalAmountDue) * 100) : 100;
              return (
                <li key={st.id} className="lg-row flex-wrap sm:flex-nowrap">
                  <span className="lg-avatar h-11 w-11 text-xs shrink-0">
                    {st.firstName[0]}{st.lastName[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">
                      {st.firstName} <span className="uppercase">{st.lastName}</span>
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {st.class ? st.class.name : <span className="text-rose-400">Sans classe</span>}
                      {st.phone ? ` · ${st.phone}` : ''}
                    </p>
                  </div>

                  <div className="w-full sm:w-44 shrink-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Dû {formatCurrency(st.totalAmountDue)}</span>
                      <span className={`font-semibold ${st.remaining <= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                        {st.remaining <= 0 ? 'Payé' : `Reste ${formatCurrency(st.remaining)}`}
                      </span>
                    </div>
                    <div className="lg-progress">
                      <span style={{ width: `${progress}%`, backgroundImage: st.remaining <= 0 ? 'linear-gradient(90deg,#34d399,#059669)' : undefined }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => setDetail(st)} className="lg-icon-btn" aria-label={`Voir ${st.firstName}`}>
                      <Eye className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => openEdit(st)} className="lg-icon-btn" aria-label={`Modifier ${st.firstName}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setToDelete(st)} className="lg-icon-btn hover:text-rose-600" aria-label={`Supprimer ${st.firstName}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassPanel>

      {/* Formulaire élève */}
      <GlassModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Modifier l\'élève' : 'Nouvel élève'}
        description="Les frais dépendent de la classe sélectionnée."
        size="sm"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="lg-label" htmlFor="st-first">Prénom</label>
              <input id="st-first" required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="lg-input" />
            </div>
            <div>
              <label className="lg-label" htmlFor="st-last">Nom</label>
              <input id="st-last" required value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="lg-input" />
            </div>
          </div>
          <div>
            <label className="lg-label" htmlFor="st-phone">Téléphone</label>
            <input id="st-phone" type="tel" placeholder="06 12 34 56 78" value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="lg-input" />
          </div>
          <div>
            <label className="lg-label" htmlFor="st-class">Classe</label>
            <select
              id="st-class"
              value={form.classId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value ? Number(e.target.value) : null }))}
              className="lg-select"
            >
              <option value="">Sans classe</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.tuitionFee)})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton variant="ghost" onClick={() => setFormOpen(false)}>Annuler</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} icon={<Plus className="w-4 h-4" />}>
              {saving ? 'Enregistrement…' : editing ? 'Sauvegarder' : 'Inscrire'}
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Fiche élève */}
      <GlassModal open={Boolean(detail)} onClose={() => setDetail(null)} size="md">
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="lg-avatar h-14 w-14 text-lg">{detail.firstName[0]}{detail.lastName[0]}</span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-slate-900 truncate">
                  {detail.firstName} <span className="uppercase">{detail.lastName}</span>
                </p>
                <p className="text-sm text-slate-400">
                  {detail.class ? `Classe ${detail.class.name}` : 'Sans classe'}
                  {detail.phone ? ` · ${detail.phone}` : ''}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="lg-stat text-center">
                <p className="text-xs text-slate-400">Total dû</p>
                <p className="text-base font-extrabold text-slate-800 mt-0.5">{formatCurrency(detail.totalAmountDue)}</p>
              </div>
              <div className="lg-stat text-center">
                <p className="text-xs text-slate-400">Payé</p>
                <p className="text-base font-extrabold text-emerald-600 mt-0.5">{formatCurrency(detail.totalPaid)}</p>
              </div>
              <div className="lg-stat text-center">
                <p className="text-xs text-slate-400">Reste</p>
                <p className={`text-base font-extrabold mt-0.5 ${detail.remaining <= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                  {formatCurrency(detail.remaining)}
                </p>
              </div>
            </div>

            <div>
              <p className="lg-section-title mb-2">Historique des paiements ({detail.payments.length})</p>
              {detail.payments.length === 0 ? (
                <p className="text-sm text-slate-400 bg-white/60 rounded-xl px-3 py-3">Aucun paiement enregistré.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-52 overflow-y-auto rounded-xl bg-white/50">
                  {[...detail.payments]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">+{formatCurrency(p.amount)}</p>
                          <p className="text-xs text-slate-400">{p.method}</p>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <GlassButton variant="ghost" icon={<Trash2 className="w-4 h-4" />} className="text-rose-600" onClick={() => setToDelete(detail)}>
                Supprimer
              </GlassButton>
              <GlassButton icon={<Wallet className="w-4 h-4" />} onClick={() => navigate(`/finances?new=1&studentId=${detail.id}`)}>
                Ajouter paiement
              </GlassButton>
              <GlassButton variant="primary" icon={<Pencil className="w-4 h-4" />} onClick={() => openEdit(detail)}>
                Modifier
              </GlassButton>
            </div>
          </div>
        )}
      </GlassModal>

      {/* Confirmation suppression */}
      <GlassModal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Supprimer l'élève" size="sm">
        <p className="text-sm text-slate-600">
          Supprimer définitivement <strong>{toDelete?.firstName} {toDelete?.lastName}</strong> ? Ses paiements et
          présences seront également supprimés.
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
