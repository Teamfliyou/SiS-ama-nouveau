import { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { toast } from '../utils/toast';
import { useIsMobile } from '../hooks/useIsMobile';
import Sheet from '../components/mobile/Sheet';
import ActionMenu from '../components/mobile/ActionMenu';
import { mList } from '../components/mobile/styles';

type ClassItem = { id: number; name: string; tuitionFee: number; _count: { students: number } };

export default function Classes() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [name, setName] = useState('');
  const [tuitionFee, setTuitionFee] = useState('0');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const data = await safeJson<ClassItem[]>(await authFetch('/api/classes'));
      setClasses(data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body = JSON.stringify({ name, tuitionFee: tuitionFee === '' ? 0 : Number(tuitionFee) });
      const res = editingId
        ? await authFetch(`/api/classes/${editingId}`, { method: 'PUT', body })
        : await authFetch('/api/classes', { method: 'POST', body });
      await safeJson(res);
      toast.success(editingId ? 'Classe mise à jour' : 'Classe créée');
      resetForm();
      fetchClasses();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm("Voulez-vous vraiment supprimer cette classe ? Les élèves associés seront mis en 'Sans classe'. L'historique d'appel, les évaluations et leurs notes, l'emploi du temps et le cahier de textes de cette classe seront supprimés.")) return;
    try {
      await safeJson(await authFetch(`/api/classes/${id}`, { method: 'DELETE' }));
      toast.success('Classe supprimée');
      fetchClasses();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const openEdit = (cls: ClassItem) => {
    setEditingId(cls.id);
    setName(cls.name);
    setTuitionFee(cls.tuitionFee.toString());
    setFormOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTuitionFee('0');
    setFormOpen(false);
  };

  const openCreate = () => { resetForm(); setFormOpen(true); };

  const classForm = (
    <form onSubmit={handleSave} className="space-y-4 mobile:px-5">
      <div>
        <label className="block text-sm font-medium text-slate-700">Nom de la classe</label>
        <input 
          type="text" required
          placeholder="ex: 6ème A"
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Frais de scolarité (€)</label>
        <input 
          type="number" required step="0.01" inputMode="decimal"
          className="mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl"
          value={tuitionFee}
          onChange={e => setTuitionFee(e.target.value)}
        />
      </div>
      <button 
        type="submit" disabled={loading}
        className={`w-full flex items-center justify-center py-2 px-4 shadow-sm border border-transparent rounded-lg text-sm font-medium text-white transition-colors mobile:min-h-[48px] mobile:rounded-xl mobile:text-[15px] mobile:font-semibold ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}
       >
         {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
         {editingId ? 'Sauvegarder' : 'Créer la classe'}
      </button>
    </form>
  );

  // ── Téléphone ──
  const mobileView = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="px-1 text-[13px] font-medium text-slate-500">{classes.length} classe{classes.length > 1 ? 's' : ''}</p>
        <button type="button" onClick={openCreate}
          className="h-11 px-4 flex items-center gap-1.5 rounded-xl bg-primary text-white text-[15px] font-semibold shadow-sm shadow-primary/25 active:bg-blue-600">
          <Plus className="w-5 h-5" /> Nouvelle classe
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="glass-surface rounded-2xl px-6 py-12 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-[15px] font-medium text-slate-500">Aucune classe créée.</p>
        </div>
      ) : (
        <ul className={mList}>
          {classes.map(cls => (
            <li key={cls.id} className="flex items-center gap-3 pl-4 pr-3 min-h-[64px]">
              <button type="button" onClick={() => openEdit(cls)} className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><BookOpen className="w-5 h-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900 truncate">{cls.name}</span>
                  <span className="block text-[13px] text-slate-500 truncate">
                    <span className="font-medium text-emerald-600">{formatCurrency(cls.tuitionFee)}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    {cls._count.students} élève{cls._count.students > 1 ? 's' : ''}
                  </span>
                </span>
              </button>
              <ActionMenu
                title={cls.name}
                actions={[
                  { label: 'Modifier', icon: Pencil, onClick: () => openEdit(cls) },
                  { label: 'Supprimer', icon: Trash2, onClick: () => handleDelete(cls.id), danger: true },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={formOpen} onClose={resetForm} title={editingId ? 'Modifier la classe' : 'Nouvelle classe'}>
        {classForm}
      </Sheet>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Gestion des Classes</h2>
        <p className="mt-2 text-sm text-slate-500">Créez, modifiez ou supprimez les classes de votre établissement.</p>
      </div>

      {isMobile ? mobileView : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className={`rounded-2xl shadow-sm border p-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Modifier la classe' : 'Nouvelle classe'}
              </h3>
              {editingId && (
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5"/>
                </button>
              )}
            </div>
            {classForm}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
             <table className="min-w-full divide-y divide-slate-200">
               <thead className="bg-slate-50">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Classe</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Frais</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Élèves</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-slate-100">
                 {classes.length === 0 ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                       <BookOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                       Aucune classe créée.
                     </td>
                   </tr>
                 ) : (
                   classes.map((cls) => (
                     <tr key={cls.id} className="hover:bg-slate-50/50 group transition-colors">
<td className="px-6 py-4 font-medium text-slate-900">{cls.name}</td>
                        <td className="px-6 py-4 text-emerald-600 font-semibold">{formatCurrency(cls.tuitionFee)}</td>
                       <td className="px-6 py-4 text-slate-500">{cls._count.students} élèves</td>
                       <td className="px-6 py-4 text-right space-x-2">
                         <button 
                           onClick={() => openEdit(cls)}
                           className="inline-flex items-center p-1.5 border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:text-blue-600"
                         >
                           <Pencil className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleDelete(cls.id)}
                           className="inline-flex items-center p-1.5 border border-red-100 text-red-500 rounded-md hover:bg-red-50"
                         >
                           <Trash2 className="w-4 h-4" />
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
      )}
    </div>
  );
}
