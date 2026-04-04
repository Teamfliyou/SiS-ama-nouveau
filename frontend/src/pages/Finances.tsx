import { useState, useEffect } from 'react';
import { CreditCard, Plus, Pencil, Trash2, X, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../utils/api';

export default function Finances() {
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form State
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Espèces');

  useEffect(() => {
    fetchPayments();
    fetchStudents();
  }, []);

  const fetchPayments = async () => {
    const res = await authFetch('/api/payments');
    if (res.ok) setPayments(await res.json());
  };

  const fetchStudents = async () => {
    const res = await authFetch('/api/students');
    if (res.ok) setStudents(await res.json());
  };

  const selectedStudent = students.find(s => s.id === parseInt(studentId));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId && !editingId) return;
    setLoading(true);
    try {
      if (editingId) {
        // Edit mode
        await authFetch(`/api/payments/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ amount, method })
        });
      } else {
        // Create mode
        await authFetch('/api/payments', {
          method: 'POST',
          body: JSON.stringify({ amount, studentId, method })
        });
      }
      resetForm();
      fetchPayments();
      fetchStudents(); // refresh balances
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm("Voulez-vous vraiment supprimer ce paiement ?")) return;
    try {
      await authFetch(`/api/payments/${id}`, { method: 'DELETE' });
      fetchPayments();
      fetchStudents();
    } catch(err) { console.error(err); }
  };

  const openEdit = (pay: any) => {
    setEditingId(pay.id);
    setStudentId(pay.studentId.toString());
    setAmount(pay.amount.toString());
    setMethod(pay.method);
  };

  const resetForm = () => {
    setEditingId(null);
    setStudentId('');
    setAmount('');
    setMethod('Espèces');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Finances & Paiements</h2>
          <p className="mt-2 text-sm text-slate-500">Gérez les historiques de paiements et les acomptes des étudiants.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Form and Summary */}
        <div className="lg:col-span-1 space-y-6">
          {/* Summary Card */}
          {selectedStudent && (
            <div className={`p-5 rounded-2xl border animate-in zoom-in-95 duration-200 ${selectedStudent.remaining <= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
               <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center">
                 {selectedStudent.remaining <= 0 ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> : <CreditCard className="w-4 h-4 mr-2 text-blue-500" />}
                 Résumé : {selectedStudent.firstName}
               </h4>
               <div className="space-y-3">
                 <div className="flex justify-between text-xs">
                   <span className="text-slate-500">Total dû :</span>
                   <span className="font-bold text-slate-700">{selectedStudent.totalAmountDue} €</span>
                 </div>
                 <div className="flex justify-between text-xs">
                   <span className="text-slate-500">Déjà payé :</span>
                   <span className="font-bold text-emerald-600">+{selectedStudent.totalPaid} €</span>
                 </div>
                 <div className="pt-2 border-t border-blue-200 flex justify-between items-center">
                   <span className="text-xs font-bold text-slate-700">Reste à payer :</span>
                   <span className={`text-sm font-black ${selectedStudent.remaining <= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                     {selectedStudent.remaining} €
                   </span>
                 </div>
               </div>
            </div>
          )}

          {/* Payment Form */}
          <div className={`rounded-2xl shadow-sm border p-6 transition-all ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Modifier paiement' : 'Nouveau paiement'}
              </h3>
              {editingId && (
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5"/>
                </button>
              )}
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Élève</label>
                  <select 
                    required
                    className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-slate-50"
                    value={studentId} onChange={e => setStudentId(e.target.value)}
                  >
                    <option value="">-- Choisir un élève --</option>
                    {students.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.firstName} {st.lastName} ({st.class?.name || 'Sans classe'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {editingId && (
                 <div className="p-2 bg-white/50 border border-amber-200 rounded-md mb-2">
                    <p className="text-xs font-medium text-amber-700">Modification pour : {selectedStudent?.firstName} {selectedStudent?.lastName}</p>
                 </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-slate-700">Montant (€)</label>
                <div className="relative mt-1">
                  <input 
                    type="number" required step="0.01"
                    className="block w-full px-3 py-2 pl-9 border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-primary transition-all"
                    value={amount} onChange={e => setAmount(e.target.value)}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700">Méthode</label>
                <select 
                  className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg shadow-sm bg-white"
                  value={method} onChange={e => setMethod(e.target.value)}
                >
                  <option>Espèces</option>
                  <option>Virement</option>
                  <option>Chèque</option>
                  <option>Mobile Money</option>
                </select>
              </div>
              
              <button 
                type="submit" disabled={loading}
                className={`w-full flex items-center justify-center py-2.5 shadow-sm rounded-lg text-sm font-bold text-white transition-all ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}
               >
                 {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                 {editingId ? 'Enregistrer les changements' : 'Valider ce paiement'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: History Table */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800">Historique des transactions</h3>
                <div className="text-xs text-slate-400 uppercase font-semibold">Trié par date décroissante</div>
             </div>
             <table className="min-w-full divide-y divide-slate-200">
               <thead className="bg-white">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Élève / Classe</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Montant</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mode</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-slate-100">
                 {payments.length === 0 ? (
                   <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                       <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                       Aucune transaction historisée.
                     </td>
                   </tr>
                 ) : (
                   payments.map((pay) => (
                     <tr key={pay.id} className="hover:bg-slate-50/30 group transition-colors">
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                         {new Date(pay.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                       </td>
                       <td className="px-6 py-4">
                         <div className="text-sm font-semibold text-slate-900">{pay.student.firstName} {pay.student.lastName}</div>
                         <div className="text-xs text-slate-400">{pay.student.class?.name || 'Sans classe'}</div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className="text-sm font-black text-emerald-600">+{pay.amount} €</span>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-black bg-slate-100 text-slate-500 border border-slate-200">
                           {pay.method}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-right space-x-2">
                         <button 
                           onClick={() => openEdit(pay)}
                           className="inline-flex items-center p-1.5 border border-slate-100 text-slate-400 rounded-lg hover:bg-slate-50 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"
                           title="Corriger"
                         >
                           <Pencil className="w-3.5 h-3.5" />
                         </button>
                         <button 
                           onClick={() => handleDelete(pay.id)}
                           className="inline-flex items-center p-1.5 border border-slate-100 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                           title="Supprimer"
                         >
                           <Trash2 className="w-3.5 h-3.5" />
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
