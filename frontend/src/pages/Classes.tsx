import { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2, X, Save } from 'lucide-react';

export default function Classes() {
  const [classes, setClasses] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [tuitionFee, setTuitionFee] = useState('0');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    const res = await fetch('http://localhost:5000/api/classes');
    if (res.ok) {
      const data = await res.json();
      setClasses(data);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await fetch(`http://localhost:5000/api/classes/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, tuitionFee })
        });
      } else {
        await fetch('http://localhost:5000/api/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, tuitionFee })
        });
      }
      resetForm();
      fetchClasses();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm("Voulez-vous vraiment supprimer cette classe ? Les élèves associés seront mis en 'Sans classe'.")) return;
    try {
      await fetch(`http://localhost:5000/api/classes/${id}`, { method: 'DELETE' });
      fetchClasses();
    } catch(err) { console.error(err); }
  };

  const openEdit = (cls: any) => {
    setEditingId(cls.id);
    setName(cls.name);
    setTuitionFee(cls.tuitionFee.toString());
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTuitionFee('0');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Gestion des Classes</h2>
        <p className="mt-2 text-sm text-slate-500">Créez, modifiez ou supprimez les classes de votre établissement.</p>
      </div>

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
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom de la classe</label>
                <input 
                  type="text" required
                  placeholder="ex: 6ème A"
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Frais de scolarité (€)</label>
                <input 
                  type="number" required step="0.01"
                  className="mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm"
                  value={tuitionFee}
                  onChange={e => setTuitionFee(e.target.value)}
                />
              </div>
              <button 
                type="submit" disabled={loading}
                className={`w-full flex items-center justify-center py-2 px-4 shadow-sm border border-transparent rounded-lg text-sm font-medium text-white transition-colors ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}
               >
                 {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                 {editingId ? 'Sauvegarder' : 'Créer la classe'}
              </button>
            </form>
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
                       <td className="px-6 py-4 text-emerald-600 font-semibold">{cls.tuitionFee} €</td>
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
    </div>
  );
}
