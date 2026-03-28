import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2, X, Save } from 'lucide-react';

export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  
  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [classId, setClassId] = useState('');
  
  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async () => {
    const res = await fetch('http://localhost:5000/api/students');
    if (res.ok) setStudents(await res.json());
  };

  const fetchClasses = async () => {
    const res = await fetch('http://localhost:5000/api/classes');
    if (res.ok) setClasses(await res.json());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        // Edit mode
        await fetch(`http://localhost:5000/api/students/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, classId })
        });
      } else {
        // Create mode
        await fetch('http://localhost:5000/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, classId })
        });
      }
      resetForm();
      fetchStudents();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm("Voulez-vous vraiment supprimer cet élève ?")) return;
    try {
      await fetch(`http://localhost:5000/api/students/${id}`, { method: 'DELETE' });
      fetchStudents();
    } catch(err) { console.error(err); }
  };

  const openEdit = (st: any) => {
    setEditingId(st.id);
    setFirstName(st.firstName);
    setLastName(st.lastName);
    setClassId(st.classId ? st.classId.toString() : '');
  };

  const resetForm = () => {
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setClassId('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Gestion des Élèves</h2>
        <p className="mt-2 text-sm text-slate-500">Inscrivez et éditez le registre de vos étudiants.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <div className={`rounded-2xl shadow-sm border p-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Modifier élève' : 'Inscrire élève'}
              </h3>
              {editingId && (
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5"/>
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
                <label className="block text-sm font-medium text-slate-700">Classe (Tarif affilié)</label>
                <select 
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm bg-white focus:ring-primary focus:border-primary"
                  value={classId} onChange={e => setClassId(e.target.value)}
                  required
                >
                  <option value="">Sélectionner une classe</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.tuitionFee}€)</option>)}
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

        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
             <table className="min-w-full divide-y divide-slate-200">
               <thead className="bg-slate-50">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Élève</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Classe</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Situation Financiére</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-slate-100">
                 {students.length === 0 ? (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                       <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                       Aucun élève trouvé.
                     </td>
                   </tr>
                 ) : (
                   students.map((st) => (
                     <tr key={st.id} className="hover:bg-slate-50/50 group">
                       <td className="px-6 py-4 font-medium text-slate-900">
                         {st.firstName} {st.lastName}
                       </td>
                       <td className="px-6 py-4 text-slate-500">
                         {st.class?.name || <span className="text-red-400 italic">Sans classe</span>}
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex flex-col">
                           <span className="text-sm font-medium text-slate-700">Dû : {st.totalAmountDue} €</span>
                           <span className={`text-xs font-semibold ${st.remaining <= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                             {st.remaining <= 0 ? '✓ Entièrement payé' : `Reste : ${st.remaining} €`}
                           </span>
                         </div>
                       </td>
                       <td className="px-6 py-4 text-right space-x-2">
                         <button 
                           onClick={() => openEdit(st)}
                           className="inline-flex items-center p-1.5 border border-slate-200 text-slate-500 rounded-md hover:bg-slate-50 hover:text-blue-600 transition-colors"
                           title="Modifier"
                         >
                           <Pencil className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleDelete(st.id)}
                           className="inline-flex items-center p-1.5 border border-red-100 text-red-500 rounded-md hover:bg-red-50 transition-colors"
                           title="Supprimer"
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
    </div>
  );
}
