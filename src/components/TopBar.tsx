import React from 'react';
import type { ActiveView } from '../types';

interface TopBarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onPrimaryAction: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onNavigate,
  onPrimaryAction,
}) => {
  return (
    <header className="w-full border-b border-zinc-200 bg-[#F7F7F5]/95 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('arena')}
          className="font-display text-lg font-bold tracking-tight text-[#18181B] hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
        >
          Qual?
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav aria-label="Navegação principal" className="flex items-center gap-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => onNavigate('arena')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm ${
              activeView === 'arena'
                ? 'text-[#18181B] underline underline-offset-8 decoration-[#2563EB] decoration-2'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            Arena
          </button>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm ${
              activeView === 'dashboard'
                ? 'text-[#18181B] underline underline-offset-8 decoration-[#2563EB] decoration-2'
                : 'text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            Painel
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.98] rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]"
          >
            {activeView === 'arena' ? 'Carregar Imagens' : 'Voltar à Votação'}
          </button>
        </div>
      </div>
    </header>
  );
};
