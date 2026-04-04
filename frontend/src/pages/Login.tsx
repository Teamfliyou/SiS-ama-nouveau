import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', data.email || email);
        navigate('/dashboard');
      } else {
        setMessage('Erreur: ' + data.error);
      }
    } catch (err: any) {
      setMessage('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 to-gray-50 p-4">
      <div className="bg-white/80 backdrop-blur-md p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-md border border-white/40">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 text-primary p-3 rounded-xl">
             <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0v6m0-6l-9 5m9-5l9 5" />
            </svg>
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-center text-slate-800 mb-2">ASSO AMA SIS</h2>
        <p className="text-center text-slate-500 mb-8 text-sm">Gestion du Système d'Information Scolaire</p>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input 
              type="email" 
              required
              className="mt-1 block w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition duration-200 placeholder:text-slate-400"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Mot de passe</label>
            <input 
              type="password" 
              required
              className="mt-1 block w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition duration-200 placeholder:text-slate-400"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-[0_4px_14px_0_rgba(26,115,232,0.39)] text-sm font-bold text-white bg-primary hover:bg-blue-600 hover:shadow-[0_6px_20px_rgba(26,115,232,0.23)] hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion...' : 'Accéder au Portail'}
          </button>
        </form>

        {message && (
          <div className="mt-6 text-center text-sm font-medium text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
