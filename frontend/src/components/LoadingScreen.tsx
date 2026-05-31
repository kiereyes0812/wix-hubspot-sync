import { Zap } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Zap size={22} className="text-white" />
        </div>
        <p className="text-zinc-600 text-sm">Initializing dashboard…</p>
      </div>
    </div>
  );
}
