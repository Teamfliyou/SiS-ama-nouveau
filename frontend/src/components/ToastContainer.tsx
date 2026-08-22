import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast, type ToastItem } from '../utils/toast';

const TOAST_DURATION = 3500;

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(
    () =>
      toast.subscribe(item => {
        setItems(prev => [...prev.slice(-4), item]);
        setTimeout(() => setItems(prev => prev.filter(t => t.id !== item.id)), TOAST_DURATION);
      }),
    []
  );

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-full max-w-sm space-y-3">
      {items.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border bg-white animate-in fade-in slide-in-from-right-4 duration-200 ${
            t.kind === 'success' ? 'border-emerald-200' : 'border-red-200'
          }`}
        >
          {t.kind === 'success'
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            : <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
          <p className={`text-sm font-medium ${t.kind === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
            {t.message}
          </p>
        </div>
      ))}
    </div>
  );
}
