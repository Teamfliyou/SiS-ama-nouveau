import { useState, useEffect } from 'react';
import { Trash2, Plus, X, Eye, EyeOff, UserCog, Pencil } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { useIsMobile } from '../hooks/useIsMobile';
import Sheet from '../components/mobile/Sheet';
import ActionMenu from '../components/mobile/ActionMenu';
import { mList } from '../components/mobile/styles';
import { ROLES, roleInfo, type Role } from '../utils/roles';

type User = {
  id: number;
  email: string;
  role: Role;
  teacherId: number | null;
  teacher: { id: number; firstName: string; lastName: string } | null;
  createdAt: string;
};
type TeacherItem = { id: number; firstName: string; lastName: string };

const fieldCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary text-sm mobile:rounded-xl bg-white';

const avatarCls = (role: Role) =>
  role === 'ADMIN'
    ? 'bg-gradient-to-tr from-violet-500 to-purple-400'
    : role === 'TEACHER'
      ? 'bg-gradient-to-tr from-emerald-500 to-teal-400'
      : 'bg-gradient-to-tr from-primary to-blue-400';

const teacherName = (t: { firstName: string; lastName: string }) => `${t.firstName} ${t.lastName.toUpperCase()}`;

/** Accounts of the team: Administrateur, Vie scolaire, Prof (linked to a teacher record). */
export default function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [teacherId, setTeacherId] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Role change of an existing account.
  const [editing, setEditing] = useState<{ user: User; role: Role; teacherId: string } | null>(null);
  const currentEmail = localStorage.getItem('user') || '';
  const isMobile = useIsMobile();

  const fetchUsers = async () => {
    try {
      setUsers(await safeJson<User[]>(await authFetch('/api/users')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  useEffect(() => {
    void fetchUsers();
    authFetch('/api/teachers')
      .then((r) => safeJson<TeacherItem[]>(r))
      .then((list) => setTeachers([...list].sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'))))
      .catch(() => {});
  }, []);

  /** Teachers without an account, plus the one already linked to the account being edited. */
  const freeTeachers = (exceptUserId?: number) =>
    teachers.filter((t) => !users.some((u) => u.teacherId === t.id && u.id !== exceptUserId));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, role, teacherId: role === 'TEACHER' && teacherId ? Number(teacherId) : null }),
      });
      await safeJson(res);
      toast.success('Compte créé');
      setEmail(''); setPassword(''); setRole('STAFF'); setTeacherId('');
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally { setLoading(false); }
  };

  const saveRole = async () => {
    if (!editing) return;
    try {
      const res = await authFetch(`/api/users/${editing.user.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({
          role: editing.role,
          teacherId: editing.role === 'TEACHER' && editing.teacherId ? Number(editing.teacherId) : null,
        }),
      });
      await safeJson(res);
      toast.success(`Rôle modifié : ${editing.user.email}`);
      setEditing(null);
      fetchUsers();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Supprimer l'utilisateur ${user.email} ?`)) return;
    try {
      const res = await authFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      await safeJson(res);
      toast.success(`Utilisateur supprimé : ${user.email}`);
      fetchUsers();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const startEdit = (user: User) => setEditing({ user, role: user.role, teacherId: user.teacherId ? String(user.teacherId) : '' });

  /** Role select, plus the teacher record for a Prof account. */
  const roleFields = (value: Role, onRole: (r: Role) => void, tid: string, onTeacher: (t: string) => void, exceptUserId?: number) => (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
        <select value={value} onChange={(e) => onRole(e.target.value as Role)} className={fieldCls}>
          {ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      </div>
      {value === 'TEACHER' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fiche du professeur</label>
          <select required value={tid} onChange={(e) => onTeacher(e.target.value)} className={fieldCls}>
            <option value="">-- Choisir le professeur --</option>
            {freeTeachers(exceptUserId).map((t) => <option key={t.id} value={t.id}>{teacherName(t)}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Le prof verra la classe dont il est responsable et celles où il a cours dans l'emploi du temps.</p>
        </div>
      )}
    </>
  );

  const userForm = (
    <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mobile:grid-cols-1 mobile:px-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input
          type="email" required inputMode="email" autoComplete="off"
          value={email} onChange={e => setEmail(e.target.value)}
          className={fieldCls}
          placeholder="prenom@example.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
        <div className="relative">
          <input
            type={showPwd ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)}
            className={`${fieldCls} pr-10`}
            placeholder="Min. 8 caractères"
          />
          <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label="Afficher / masquer" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 mobile:right-1 mobile:p-2.5">
            {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
          </button>
        </div>
      </div>
      {roleFields(role, setRole, teacherId, setTeacherId)}
      {error && <p className="sm:col-span-2 mobile:col-span-1 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="sm:col-span-2 flex justify-end gap-3 mobile:col-span-1 mobile:grid mobile:grid-cols-2 mobile:gap-2">
        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors mobile:min-h-[48px] mobile:rounded-xl mobile:bg-slate-100 mobile:text-[15px] mobile:font-semibold">Annuler</button>
        <button type="submit" disabled={loading} className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-all disabled:opacity-60 mobile:min-h-[48px] mobile:rounded-xl mobile:text-[15px]">
          {loading ? 'Création...' : 'Créer le compte'}
        </button>
      </div>
    </form>
  );

  const roleForm = editing && (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mobile:px-5">
      {roleFields(
        editing.role,
        (r) => setEditing({ ...editing, role: r }),
        editing.teacherId,
        (t) => setEditing({ ...editing, teacherId: t }),
        editing.user.id
      )}
      <div className="sm:col-span-2 flex justify-end gap-3 mobile:grid mobile:grid-cols-2 mobile:gap-2">
        <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg mobile:min-h-[48px] mobile:rounded-xl mobile:bg-slate-100">Annuler</button>
        <button type="button" onClick={saveRole} disabled={editing.role === 'TEACHER' && !editing.teacherId}
          className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-60 mobile:min-h-[48px] mobile:rounded-xl">
          Enregistrer
        </button>
      </div>
    </div>
  );

  /** "Prof · Karim HADDAD", with a warning when a Prof account lost its teacher record. */
  const roleLine = (user: User) => (
    <>
      {roleInfo(user.role).label}
      {user.teacher && <> · {teacherName(user.teacher)}</>}
      {user.role === 'TEACHER' && !user.teacher && <span className="text-red-600"> · sans fiche professeur</span>}
    </>
  );

  const rolesHelp = (
    <div className="text-sm text-slate-600 space-y-0.5">
      <p className="font-semibold text-slate-800 mb-1">Rôles disponibles</p>
      {ROLES.map((r) => (
        <p key={r.code}><span className="font-medium text-slate-800">{r.label}</span> — {r.description}</p>
      ))}
    </div>
  );

  // ── Téléphone ──
  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="px-1 text-[13px] font-medium text-slate-500">{users.length} compte{users.length > 1 ? 's' : ''}</p>
          <button type="button" onClick={() => { setShowForm(true); setError(''); }}
            className="h-11 px-4 flex items-center gap-1.5 rounded-xl bg-primary text-white text-[15px] font-semibold shadow-sm shadow-primary/25 active:bg-blue-600">
            <Plus className="w-5 h-5" /> Nouveau
          </button>
        </div>

        <ul className={mList}>
          {users.map(user => {
            const isMe = user.email === currentEmail;
            return (
              <li key={user.id} className="flex items-center gap-3 pl-4 pr-3 min-h-[64px]">
                <span className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold text-xs text-white ${avatarCls(user.role)}`}>
                  {user.email.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 py-3">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">{user.email}</p>
                  <p className="text-[13px] text-slate-500 truncate">
                    {roleLine(user)}
                    {isMe && <span className="text-primary font-semibold"> · Vous</span>}
                  </p>
                </div>
                {!isMe && (
                  <ActionMenu
                    title={user.email}
                    actions={[
                      { label: 'Changer le rôle', icon: Pencil, onClick: () => startEdit(user) },
                      { label: 'Supprimer', icon: Trash2, onClick: () => handleDelete(user), danger: true },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-1 text-[13px] leading-relaxed">{rolesHelp}</div>

        <Sheet open={showForm} onClose={() => setShowForm(false)} title="Créer un compte">
          {userForm}
        </Sheet>
        <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Rôle de ${editing.user.email}` : ''}>
          {roleForm}
        </Sheet>
      </div>
    );
  }

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
          {userForm}
        </div>
      )}

      {/* Role change */}
      {editing && (
        <div className="bg-white border border-primary/30 rounded-2xl p-6 shadow-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-slate-800 text-lg">Rôle de {editing.user.email}</h3>
            <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
          </div>
          {roleForm}
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
            const info = roleInfo(user.role);
            return (
              <li key={user.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm text-white ${avatarCls(user.role)}`}>
                    {user.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{user.email}</p>
                      {isMe && <span className="text-[10px] font-bold bg-blue-50 text-primary px-2 py-0.5 rounded-full border border-blue-100">Vous</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {user.teacher && <>{teacherName(user.teacher)} · </>}
                      {user.role === 'TEACHER' && !user.teacher && <span className="text-red-600">Sans fiche professeur · </span>}
                      Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Role badge */}
                  <button
                    onClick={() => !isMe && startEdit(user)}
                    disabled={isMe}
                    title={isMe ? 'Votre propre rôle' : 'Changer le rôle'}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${info.badge} ${isMe ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:brightness-95'}`}
                  >
                    {info.label}
                    {!isMe && <Pencil className="w-3 h-3" />}
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
        {rolesHelp}
      </div>
    </div>
  );
}
