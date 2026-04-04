import { useState, useEffect } from 'react';
import { GraduationCap, Plus, Pencil, Trash2, X, Save, Mail, Phone, BookOpen } from 'lucide-react';
import { authFetch } from '../utils/api';

type Teacher = {
  id: number; firstName: string; lastName: string;
  subject: string | null; email: string | null; phone: string | null;
  classId: number | null; class: { id: number; name: string } | null;
  createdAt: string;
};
type ClassItem = { id: number; name: string };

const SUBJECT_COLORS: Record<string, string> = {
  'Mathématiques': 'bg-blue-100 text-blue-700',
  'Français':      'bg-violet-100 text-violet-700',
  'Histoire':      'bg-amber-100 text-amber-700',
  'Sciences':      'bg-emerald-100 text-emerald-700',
  'Anglais':       'bg-sky-100 text-sky-700',
  'EPS':           'bg-orange-100 text-orange-700',
  'Musique':       'bg-pink-100 text-pink-700',
  'Arts':          'bg-rose-100 text-rose-700',
};

const avatarColor = (name: string) => {
  const colors = ['from-blue-500 to-indigo-400','from-violet-500 to-purple-400','from-emerald-500 to-teal-400','from-amber-500 to-orange-400','from-rose-500 to-pink-400','from-cyan-500 to-sky-400'];
  return colors[name.charCodeAt(0) % colors.length];
};

const EMPTY = { firstName: '', lastName: '', subject: '', email: '', phone: '', classId: '' };

export default function Teachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTeachers();
    authFetch('/api/classes').then(r => r.json()).then(setClasses);
  }, []);

  const fetchTeachers = async () => {
    const res = await authFetch('/api/teachers');
    if (res.ok) setTeachers(await res.json());
  };

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setError(''); setShowForm(true); };

  const openEdit = (t: Teacher) => {
    setEditingId(t.id);
    setForm({
      firstName: t.firstName, lastName: t.lastName,
      subject: t.subject || '', email: t.email || '',
      phone: t.phone || '', classId: t.classId?.toString() || ''
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const body = JSON.stringify({
        ...form, classId: form.classId || null,
        email: form.email || null, phone: form.phone || null, subject: form.subject || null
      });
      const res = editingId
        ? await authFetch(`/api/teachers/${editingId}`, { method: 'PUT', body })
        : await authFetch('/api/teachers', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setShowForm(false);
      fetchTeachers();
    } finally { setLoading(false); }
  };

  const handleDelete = async (t: Teacher) => {
    if (!window.confirm(`Supprimer ${t.firstName} ${t.lastName} ?`)) return;
    await authFetch(`/api/teachers/${t.id}`, { method: 'DELETE' });
    fetchTeachers();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Professeurs</h2>
          <p className="mt-2 text-sm text-slate-500">Gérez l'équipe pédagogique et leurs affectations de classe.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-600 transition-all"
        >
          <Plus className="w-4 h-4" /> Ajouter un professeur
        </button>
      </div>

      {/* Form drawer */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-slate-800 text-lg">
              {editingId ? 'Modifier le professeur' : 'Nouveau professeur'}
            </h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
          </div>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prénom <span className="text-red-500">*</span></label>
              <input type="text" required value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom <span className="text-red-500">*</span></label>
              <input type="text" required value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Matière</label>
              <input type="text" list="subjects" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))}
                placeholder="ex: Mathématiques"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary" />
              <datalist id="subjects">
                {Object.keys(SUBJECT_COLORS).map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                placeholder="prof@exemple.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                placeholder="+33 6 00 00 00 00"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Classe assignée</label>
              <select value={form.classId} onChange={e => setForm(f => ({...f, classId: e.target.value}))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary bg-white">
                <option value="">Aucune</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {error && <p className="sm:col-span-2 lg:col-span-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
              <button type="submit" disabled={loading}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all disabled:opacity-60 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}>
                {editingId ? <><Save className="w-4 h-4"/> Sauvegarder</> : <><Plus className="w-4 h-4"/> Ajouter</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teachers grid */}
      {teachers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <GraduationCap className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Aucun professeur enregistré.</p>
          <button onClick={openCreate} className="mt-4 px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition-all">
            Ajouter le premier professeur
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {teachers.map(t => {
            const initials = `${t.firstName[0]}${t.lastName[0]}`.toUpperCase();
            const subjectClass = t.subject ? (SUBJECT_COLORS[t.subject] || 'bg-slate-100 text-slate-600') : null;
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow group relative">
                {/* Actions */}
                <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(t)}
                    className="p-1.5 border border-slate-200 text-slate-400 rounded-lg hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t)}
                    className="p-1.5 border border-slate-200 text-slate-400 rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Avatar + name */}
                <div className="flex items-center gap-4 mb-4">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-tr ${avatarColor(t.lastName)} text-white flex items-center justify-center font-bold text-sm shadow-sm`}>
                    {initials}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{t.firstName} <span className="uppercase">{t.lastName}</span></p>
                    {subjectClass && (
                      <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${subjectClass}`}>
                        {t.subject}
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2">
                  {t.email && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                      <span className="truncate">{t.email}</span>
                    </div>
                  )}
                  {t.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Phone className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                      {t.phone}
                    </div>
                  )}
                  {t.class && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                      <span className="font-medium text-slate-700">{t.class.name}</span>
                    </div>
                  )}
                  {!t.email && !t.phone && !t.class && (
                    <p className="text-xs text-slate-300 italic">Aucune information complémentaire</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
