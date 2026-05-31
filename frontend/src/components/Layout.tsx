import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Columns3,
  FileText,
  Zap,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/mapping', label: 'Field Mapping', icon: Columns3 },
  { to: '/forms', label: 'Form Integration', icon: FileText },
  { to: '/sync-log', label: 'Sync Log', icon: ArrowLeftRight },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-zinc-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-zinc-200 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-zinc-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-orange-500 rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 text-sm leading-tight">Wix × HubSpot</p>
              <p className="text-zinc-400 text-xs">Sync Dashboard</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200">
          <p className="text-xs text-zinc-400 text-center">v1.0.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
