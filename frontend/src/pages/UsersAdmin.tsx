import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, Trash2, Plus, X, Eye, EyeOff, UserCog } from 'lucide-react';
import { authFetch } from '../utils/api';

type User = { id: number; email: string; role: string; createdAt: string };

export default function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('STAFF');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentEmail = localStorage.getItem('user') || '';

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    const res = await authFetch('/api/users');
    if (res.ok) setUsers(await res.json());
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, role })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setEmail(''); setPassword(''); setRole('STAFF');
      setShowForm(false);
      fetchUsers();
    } finally { setLoading(false); }
  };

  const toggleRole = async (user: User) => {
    const newRole = user.role === 'ADMIN' ? 'STAFF' : 'ADMIN';
    const res = await authFetch(`/api/users/${user.id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) fetchUsers();
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Supprimer l'utilisateur ${user.email} ?`)) return;
    const res = await authFetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Gestion des Utilisateurs</h2>
          <p className="mt-2 text-sm text-slate-500">Gérez les accès et les rôles des membres de l'équipe.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-600 transition-all"
        >
          <Plus className="w-4 h-4" /> Nouvel utilisateur
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-slate-800 text-lg">Créer un compte</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary text-sm"
                placeholder="prenom@example.com"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} required minLength={8}
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Min. 8 caractères"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary text-sm bg-white"
              >
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
            {error && <p className="sm:col-span-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="sm:col-span-3 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Annuler</button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-all disabled:opacity-60">
                {loading ? 'Création...' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{users.length} compte{users.length > 1 ? 's' : ''}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {users.map(user => {
            const isMe = user.email === currentEmail;
            const initials = user.email.slice(0, 2).toUpperCase();
            return (
              <li key={user.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm text-white ${user.role === 'ADMIN' ? 'bg-gradient-to-tr from-violet-500 to-purple-400' : 'bg-gradient-to-tr from-primary to-blue-400'}`}>
                    {initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{user.email}</p>
                      {isMe && <span className="text-[10px] font-bold bg-blue-50 text-primary px-2 py-0.5 rounded-full border border-blue-100">Vous</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Role badge */}
                  <button
                    onClick={() => !isMe && toggleRole(user)}
                    disabled={isMe}
                    title={isMe ? 'Votre propre rôle' : `Changer en ${user.role === 'ADMIN' ? 'Staff' : 'Admin'}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      user.role === 'ADMIN'
                        ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    } ${isMe ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {user.role === 'ADMIN'
                      ? <><ShieldCheck className="w-3.5 h-3.5"/> Admin</>
                      : <><Shield className="w-3.5 h-3.5"/> Staff</>
                    }
                  </button>
                  {/* Delete */}
                  {!isMe && (
                    <button
                      onClick={() => handleDelete(user)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <UserCog className="w-5 h-5 text-primary mt-0.5 shrink-0"/>
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-800 mb-1">Rôles disponibles</p>
          <p><span className="font-medium text-violet-700">Administrateur</span> — Accès complet, gestion des utilisateurs.</p>
          <p className="mt-0.5"><span className="font-medium text-slate-700">Staff</span> — Accès à la gestion des élèves, classes, paiements et appels.</p>
        </div>
      </div>
    </div>
  );
}
