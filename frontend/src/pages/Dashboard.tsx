import { useState, useEffect } from 'react';
import { Users, BookOpen, GraduationCap, TrendingUp } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [data, setData] = useState({ studentsCount: 0, classesCount: 0, totalPayments: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    fetch('http://localhost:5000/api/stats')
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error);
  }, []);

  const stats = [
    { name: 'Élèves Inscrits', value: data.studentsCount, icon: Users, change: 'Vue globale', color: 'bg-blue-500', link: '/students' },
    { name: 'Classes Actives', value: data.classesCount, icon: BookOpen, change: 'Gérer les classes', color: 'bg-indigo-500', link: '/classes' },
    { name: 'Professeurs', value: '0', icon: GraduationCap, change: 'À venir', color: 'bg-purple-500', link: '#' },
    { name: 'Paiements totaux', value: `${data.totalPayments} €`, icon: TrendingUp, change: 'Voir trésorerie', color: 'bg-emerald-500', link: '/finances' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Vue d'ensemble</h2>
        <p className="mt-2 text-sm text-slate-500">
          Bienvenue sur le portail ASSO AMA SIS. Cliquez sur une carte pour accéder au module.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <Link 
            key={item.name} 
            to={item.link}
            className="block bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow hover:border-primary/50 relative overflow-hidden group cursor-pointer"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/0 to-${item.color.split('-')[1]}-500/10 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500`}></div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{item.name}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
              </div>
              <div className={`p-4 rounded-xl ${item.color} text-white shadow-lg shadow-${item.color.split('-')[1]}-500/30`}>
                <item.icon className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full group-hover:bg-emerald-100 transition-colors">
                {item.change} &rarr;
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-semibold text-slate-800">Dernières inscriptions</h3>
              <Link to="/students" className="text-sm text-primary font-medium hover:text-blue-700">Voir tout</Link>
            </div>
            <div className="p-12 text-center text-slate-500 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-medium text-slate-600">Accédez au registre complet</p>
              <p className="text-sm mt-1">Gérez facilement vos élèves et leurs informations.</p>
              <button onClick={() => navigate('/students')} className="mt-6 px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-blue-600 shadow-sm shadow-primary/30 transition-colors cursor-pointer">
                + Ajouter un élève
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Activité récente</h3>
            <div className="space-y-6">
              <div className="relative pl-6 pb-6 border-l-2 border-slate-100 last:pb-0 last:border-0">
                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-slate-200 border-4 border-white"></div>
                <p className="text-sm font-medium text-slate-800">Système opérationnel</p>
                <p className="text-xs text-slate-500 mt-1">À jour</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-primary/20 relative overflow-hidden">
             <div className="absolute top-0 right-0 opacity-10 blur-2xl">
                <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-64 h-64">
                  <path fill="#FFFFFF" d="M44.7,-76.4C58.8,-69.2,71.8,-59.1,79.6,-45.8...Z" transform="translate(100 100)" />
                </svg>
            </div>
            <h3 className="font-bold text-lg mb-2 relative z-10">Paiements</h3>
            <p className="text-blue-100 text-sm mb-6 relative z-10">Suivez les revenus et arriérés dans la section Finances.</p>
            <button onClick={() => navigate('/finances')} className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors text-white font-medium py-2 rounded-lg text-sm relative z-10 cursor-pointer">
              Gérer la trésorerie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
