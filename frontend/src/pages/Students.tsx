import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Pencil, Trash2, X, Save, Search, SlidersHorizontal, ChevronDown, Eye, Loader2 } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { toast } from '../utils/toast';

type Student = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  classId: number | null;
  class: { id: number; name: string; tuitionFee: number } | null;
  payments: { id: number; amount: number; date: string; method: string | null }[];
  totalPaid: number;
  totalAmountDue: number;
  remaining: number;
};
type ClassItem = { id: number; name: string; tuitionFee: number; _count: { students: number } };

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [classId, setClassId] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [detailsStudent, setDetailsStudent] = useState<Student | null>(null);

  // Filter State
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // '' | 'paid' | 'unpaid'
  const [sortBy, setSortBy] = useState<'name' | 'class' | 'remaining'>('name');

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async () => {
    try {
      setStudents(await safeJson<Student[]>(await authFetch('/api/students')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const fetchClasses = async () => {
    try {
      setClasses(await safeJson<ClassItem[]>(await authFetch('/api/classes')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = editingId
        ? await authFetch(`/api/students/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify({ firstName, lastName, phone, classId })
          })
        : await authFetch('/api/students', {
            method: 'POST',
            body: JSON.stringify({ firstName, lastName, phone, classId })
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Erreur lors de l'enregistrement"); return; }
      toast.success(editingId ? 'Élève modifié avec succès' : 'Élève inscrit avec succès');
      resetForm();
      fetchStudents();
    } catch {
      toast.error('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (st: Student) => {
    if (!window.confirm(`Supprimer définitivement ${st.firstName} ${st.lastName} ? Ses paiements seront également supprimés.`)) return;
    setDeletingId(st.id);
    try {
      const res = await authFetch(`/api/students/${st.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Erreur lors de la suppression'); return; }
      toast.success('Élève supprimé');
      if (detailsStudent?.id === st.id) setDetailsStudent(null);
      fetchStudents();
    } catch {
      toast.error('Erreur de connexion au serveur');
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (st: Student) => {
    setEditingId(st.id);
    setFirstName(st.firstName);
    setLastName(st.lastName);
    setPhone(st.phone || '');
    setClassId(st.classId ? st.classId.toString() : '');
  };

  const resetForm = () => {
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setPhone('');
    setClassId('');
  };

  const resetFilters = () => {
    setSearch('');
    setFilterClass('');
    setFilterStatus('');
    setSortBy('name');
  };

  const hasActiveFilters = search || filterClass || filterStatus || sortBy !== 'name';

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q)
      );
    }
    if (filterClass) {
      list = filterClass === '__none__'
        ? list.filter(s => !s.classId)
        : list.filter(s => s.classId === parseInt(filterClass));
    }
    if (filterStatus === 'paid')   list = list.filter(s => s.remaining <= 0);
    if (filterStatus === 'unpaid') list = list.filter(s => s.remaining > 0);

    list.sort((a, b) => {
      if (sortBy === 'name')      return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
      if (sortBy === 'class')     return (a.class?.name || '').localeCompare(b.class?.name || '');
      if (sortBy === 'remaining') return b.remaining - a.remaining;
      return 0;
    });
    return list;
  }, [students, search, filterClass, filterStatus, sortBy]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Gestion des Élèves</h2>
        <p className="mt-2 text-sm text-slate-500">Inscrivez et éditez le registre de vos étudiants.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ── Form ── */}
        <div className="lg:col-span-1">
          <div className={`rounded-2xl shadow-sm border p-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Modifier élève' : 'Inscrire élève'}
              </h3>
              {editingId && (
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Prénom</label>
                <input
                  type="text" required
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm focus:ring-primary focus:border-primary"
                  value={firstName} onChange={e => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom</label>
                <input
                  type="text" required
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm focus:ring-primary focus:border-primary"
                  value={lastName} onChange={e => setLastName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Téléphone</label>
                <input
                  type="tel"
                  placeholder="06 12 34 56 78"
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm focus:ring-primary focus:border-primary"
                  value={phone} onChange={e => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Classe (Tarif affilié)</label>
                <select
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm bg-white focus:ring-primary focus:border-primary"
                  value={classId} onChange={e => setClassId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner une classe</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.tuitionFee)})</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1">Les frais de l'élève dépendent de sa classe.</p>
              </div>
              <button
                type="submit" disabled={loading}
                className={`w-full flex items-center justify-center py-2 shadow-sm rounded-lg text-sm font-medium text-white transition-colors ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}
              >
                {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {editingId ? 'Sauvegarder' : 'Inscrire'}
              </button>
            </form>
          </div>
        </div>

        {/* ── Table + Filters ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            {/* Row 1: search + reset */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Rechercher un élève..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-slate-50 focus:bg-white transition-all"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Réinitialiser
                </button>
              )}
            </div>

            {/* Row 2: dropdowns */}
            <div className="flex gap-3 flex-wrap items-center">
              <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />

              {/* Class filter */}
              <div className="relative">
                <select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  className={`appearance-none pl-3 pr-8 py-1.5 border rounded-lg text-sm font-medium transition-colors bg-white cursor-pointer ${filterClass ? 'border-primary text-primary bg-blue-50' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  <option value="">Toutes les classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__none__">Sans classe</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Payment status filter */}
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className={`appearance-none pl-3 pr-8 py-1.5 border rounded-lg text-sm font-medium transition-colors bg-white cursor-pointer ${filterStatus ? 'border-primary text-primary bg-blue-50' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  <option value="">Toutes situations</option>
                  <option value="paid">✓ Entièrement payé</option>
                  <option value="unpaid">⚠ Solde restant</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Sort */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as 'name' | 'class' | 'remaining')}
                  className={`appearance-none pl-3 pr-8 py-1.5 border rounded-lg text-sm font-medium transition-colors bg-white cursor-pointer ${sortBy !== 'name' ? 'border-primary text-primary bg-blue-50' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  <option value="name">Trier par nom</option>
                  <option value="class">Trier par classe</option>
                  <option value="remaining">Trier par solde restant</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Result count */}
              <span className="ml-auto text-xs font-semibold text-slate-400">
                {filtered.length} / {students.length} élève{students.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Élève</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Classe</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Situation Financière</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-14 text-center text-slate-400">
                      <Users className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                      <p className="font-medium">Aucun élève ne correspond aux filtres.</p>
                      {hasActiveFilters && (
                        <button onClick={resetFilters} className="mt-2 text-sm text-primary hover:underline">
                          Effacer les filtres
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/50 group transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {st.firstName[0]}{st.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-slate-900">
                              {st.firstName} <span className="uppercase">{st.lastName}</span>
                            </span>
                            {st.phone && <p className="text-xs text-slate-400">{st.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {st.class
                          ? <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700">{st.class.name}</span>
                          : <span className="text-red-400 italic text-sm">Sans classe</span>
                        }
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-slate-700">Dû : {formatCurrency(st.totalAmountDue)}</span>
                          <span className={`text-xs font-semibold ${st.remaining <= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                            {st.remaining <= 0
                              ? '✓ Entièrement payé'
                              : `Reste : ${formatCurrency(st.remaining)}`
                            }
                          </span>
                          {st.totalAmountDue > 0 && (
                            <div className="mt-1 h-1.5 w-28 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${st.remaining <= 0 ? 'bg-emerald-400' : 'bg-orange-400'}`}
                                style={{ width: `${Math.min(100, (st.totalPaid / st.totalAmountDue) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => setDetailsStudent(st)}
                          className="inline-flex items-center p-1.5 border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:text-primary transition-colors"
                          title="Consulter la fiche"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(st)}
                          className="inline-flex items-center p-1.5 border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:text-blue-600 transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(st)}
                          disabled={deletingId === st.id}
                          className="inline-flex items-center p-1.5 border border-red-100 text-red-400 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Supprimer"
                        >
                          {deletingId === st.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Student details modal ── */}
      {detailsStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setDetailsStudent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start p-6 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white flex items-center justify-center text-sm font-bold">
                  {detailsStudent.firstName[0]}{detailsStudent.lastName[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">
                    {detailsStudent.firstName} <span className="uppercase">{detailsStudent.lastName}</span>
                  </p>
                  <p className="text-sm text-slate-400">
                    {detailsStudent.class ? `Classe ${detailsStudent.class.name} — Frais : ${formatCurrency(detailsStudent.class.tuitionFee)}` : 'Sans classe'}
                  </p>
                  {detailsStudent.phone && <p className="text-sm text-slate-400">Tél : {detailsStudent.phone}</p>}
                </div>
              </div>
              <button onClick={() => setDetailsStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Financial summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase">Total dû</p>
                  <p className="text-lg font-black text-slate-700">{formatCurrency(detailsStudent.totalAmountDue)}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-emerald-500 uppercase">Payé</p>
                  <p className="text-lg font-black text-emerald-600">{formatCurrency(detailsStudent.totalPaid)}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${detailsStudent.remaining <= 0 ? 'bg-emerald-50' : 'bg-orange-50'}`}>
                  <p className={`text-xs font-semibold uppercase ${detailsStudent.remaining <= 0 ? 'text-emerald-500' : 'text-orange-400'}`}>Reste</p>
                  <p className={`text-lg font-black ${detailsStudent.remaining <= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{formatCurrency(detailsStudent.remaining)}</p>
                </div>
              </div>

              {/* Payment history */}
              <div>
                <p className="text-sm font-bold text-slate-700 mb-2">Historique des paiements ({detailsStudent.payments?.length || 0})</p>
                {(detailsStudent.payments?.length || 0) === 0 ? (
                  <p className="text-sm text-slate-400 italic bg-slate-50 rounded-xl p-4">Aucun paiement enregistré pour cet élève.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-48 overflow-y-auto">
                    {[...detailsStudent.payments]
                      .sort((a: Student['payments'][number], b: Student['payments'][number]) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((p: Student['payments'][number]) => (
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

              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => { setDetailsStudent(null); openEdit(detailsStudent); }}
                  className="px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Modifier la fiche
                </button>
                <button
                  onClick={() => setDetailsStudent(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
