import { useState } from 'react';
import { Plus, Shield, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { apiErrorMessage } from '../../utils/api';
import { toast } from '../../utils/toast';
import { useUsers, type User } from '../../hooks/useUsers';
import {
  EmptyState,
  GlassButton,
  GlassModal,
  GlassPanel,
  PageHeader,
} from '../../components/liquid';

export default function LiquidUsersAdmin() {
  const { users, create, setRole, remove } = useUsers();
  const currentEmail = localStorage.getItem('user') || '';

  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRoleValue] = useState('STAFF');
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEmail('');
    setPassword('');
    setRoleValue('STAFF');
    setFormOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ email, password, role });
      toast.success('Compte créé');
      setFormOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = async (user: User) => {
    try {
      await setRole(user.id, user.role === 'ADMIN' ? 'STAFF' : 'ADMIN');
      toast.success(`Rôle modifié : ${user.email}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await remove(toDelete.id);
      toast.success(`Utilisateur supprimé : ${toDelete.email}`);
      setToDelete(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle={`${users.length} compte${users.length > 1 ? 's' : ''}`}
        actions={
          <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            Nouvel utilisateur
          </GlassButton>
        }
      />

      <GlassPanel className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState icon={UserCog} title="Aucun utilisateur" />
        ) : (
          <ul className="divide-y divide-slate-100/70">
            {users.map((user) => {
              const isMe = user.email === currentEmail;
              const isAdmin = user.role === 'ADMIN';
              return (
                <li key={user.id} className="lg-row">
                  <span
                    className="lg-avatar h-11 w-11 text-xs"
                    style={isAdmin ? { backgroundImage: 'linear-gradient(135deg,#8b5cf6,#d946ef)' } : undefined}
                  >
                    {user.email.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-2">
                      {user.email}
                      {isMe && <span className="lg-badge lg-badge-accent">Vous</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isMe && toggleRole(user)}
                    disabled={isMe}
                    title={isMe ? 'Votre propre rôle' : `Changer en ${isAdmin ? 'Staff' : 'Admin'}`}
                    className={`lg-badge ${isAdmin ? 'lg-badge-accent' : ''} ${isMe ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    {isAdmin ? 'Admin' : 'Staff'}
                  </button>
                  {!isMe && (
                    <button type="button" onClick={() => setToDelete(user)} className="lg-icon-btn hover:text-rose-600" aria-label={`Supprimer ${user.email}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </GlassPanel>

      <GlassPanel className="p-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-white/70 rounded-xl shrink-0">
            <UserCog className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="text-sm text-slate-600">
            <p className="lg-section-title mb-1">Rôles disponibles</p>
            <p><span className="font-semibold text-violet-700">Administrateur</span> — Accès complet, gestion des utilisateurs.</p>
            <p className="mt-0.5"><span className="font-semibold text-slate-700">Staff</span> — Élèves, classes, paiements et appels.</p>
          </div>
        </div>
      </GlassPanel>

      {/* Création */}
      <GlassModal open={formOpen} onClose={() => setFormOpen(false)} title="Créer un compte" size="sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="lg-label" htmlFor="u-email">Email</label>
            <input id="u-email" type="email" required placeholder="prenom@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="lg-input" />
          </div>
          <div>
            <label className="lg-label" htmlFor="u-pwd">Mot de passe</label>
            <input id="u-pwd" type="password" required minLength={8} placeholder="Min. 8 caractères" value={password} onChange={(e) => setPassword(e.target.value)} className="lg-input" />
          </div>
          <div>
            <label className="lg-label" htmlFor="u-role">Rôle</label>
            <select id="u-role" value={role} onChange={(e) => setRoleValue(e.target.value)} className="lg-select">
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Administrateur</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton variant="ghost" onClick={() => setFormOpen(false)}>Annuler</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} icon={<Plus className="w-4 h-4" />}>
              {saving ? 'Création…' : 'Créer le compte'}
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Suppression */}
      <GlassModal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Supprimer l'utilisateur" size="sm">
        <p className="text-sm text-slate-600">
          Supprimer le compte <strong>{toDelete?.email}</strong> ?
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
