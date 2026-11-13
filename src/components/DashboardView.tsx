import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Trash2,
  LayoutGrid,
  Table as TableIcon,
  X,
  RotateCcw,
  ImageOff,
  Check,
  Users,
} from 'lucide-react';
import {
  bulkDeleteImages,
  clearImages,
  deleteImage,
  deleteUser,
  fetchDashboard,
  resetImageComparisons,
  resetScores,
} from '../api';
import type {
  DashboardLayoutMode,
  FilterOption,
  ImageItem,
  SortOption,
  UserSummary,
} from '../types';
import { UploadDropzone } from './UploadDropzone';

interface DashboardViewProps {
  uploadTriggerCount: number;
  currentUsername: string | null;
  onUserDeleted: (username: string) => void;
}

function getWinRate(img: ImageItem): number {
  const total = img.wins + img.losses;
  return total > 0 ? Math.round((img.wins / total) * 100) : 0;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  uploadTriggerCount,
  currentUsername,
  onUserDeleted,
}) => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [totalVotes, setTotalVotes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [sortOption, setSortOption] = useState<SortOption>('elo');
  const [layoutMode, setLayoutMode] = useState<DashboardLayoutMode>('grid');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  const [lightboxImage, setLightboxImage] = useState<ImageItem | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClearSamples, setConfirmClearSamples] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resettingImageId, setResettingImageId] = useState<string | null>(null);

  const loadData = useCallback(
    async (userFilter = selectedUser) => {
      setError(null);
      try {
        const data = await fetchDashboard(userFilter);
        setImages(data.images);
        setUsers(data.users);
        setTotalVotes(data.totalVotes);
        setSelectedIds((prev) => {
          const valid = new Set(data.images.map((i) => i.id));
          const next = new Set<string>();
          prev.forEach((id) => {
            if (valid.has(id)) next.add(id);
          });
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar o painel.');
      } finally {
        setLoading(false);
      }
    },
    [selectedUser],
  );

  useEffect(() => {
    loadData(selectedUser);
  }, [loadData, selectedUser]);

  useEffect(() => {
    if (!lightboxImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxImage]);

  const rankById = useMemo(() => {
    const map = new Map<string, number>();
    const byElo = [...images].sort((a, b) => b.elo - a.elo || b.wins - a.wins);
    byElo.forEach((img, idx) => map.set(img.id, idx + 1));
    return map;
  }, [images]);

  const filteredAndSorted = useMemo(() => {
    let list = [...images];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (img) =>
          img.title.toLowerCase().includes(q) || img.filename.toLowerCase().includes(q),
      );
    }

    if (filterOption === 'top') {
      list = list.filter((img) => (rankById.get(img.id) ?? 999) <= 10);
    } else if (filterOption === 'unrated') {
      list = list.filter((img) => img.wins + img.losses === 0);
    }

    list.sort((a, b) => {
      if (sortOption === 'elo') {
        return b.elo - a.elo || b.wins - a.wins;
      }
      if (sortOption === 'wins') {
        return b.wins - a.wins || b.elo - a.elo;
      }
      if (sortOption === 'winRate') {
        return getWinRate(b) - getWinRate(a) || b.wins - a.wins;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [images, searchQuery, filterOption, sortOption, rankById]);

  const hasSamples = useMemo(() => images.some((img) => img.isSample), [images]);

  const topElo = useMemo(() => {
    if (images.length === 0) return '—';
    return String(Math.round(Math.max(...images.map((i) => i.elo))));
  }, [images]);

  const bestWinRate = useMemo(() => {
    const rated = images.filter((i) => i.wins + i.losses > 0);
    if (rated.length === 0) return '—';
    return `${Math.max(...rated.map(getWinRate))}%`;
  }, [images]);

  const toggleSelect = (id: string) => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allFilteredSelected =
    filteredAndSorted.length > 0 &&
    filteredAndSorted.every((img) => selectedIds.has(img.id));

  const toggleSelectAllFiltered = () => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredAndSorted.forEach((img) => next.delete(img.id));
      } else {
        filteredAndSorted.forEach((img) => next.add(img.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setError(null);
    try {
      await bulkDeleteImages(Array.from(selectedIds));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      if (lightboxImage && selectedIds.has(lightboxImage.id)) {
        setLightboxImage(null);
      }
      await loadData(selectedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao eliminar as imagens selecionadas.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteImage(id);
      if (lightboxImage?.id === id) setLightboxImage(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadData(selectedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao eliminar a imagem.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetSingleImage = async (id: string) => {
    setResettingImageId(id);
    setError(null);
    try {
      await resetImageComparisons(id);
      await loadData(selectedUser);
      if (lightboxImage?.id === id) {
        setLightboxImage((prev) =>
          prev ? { ...prev, wins: 0, losses: 0, elo: 1200 } : null,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao repor as comparações desta imagem.',
      );
    } finally {
      setResettingImageId(null);
    }
  };

  const handleResetScores = async () => {
    try {
      await resetScores(selectedUser);
      setConfirmReset(false);
      await loadData(selectedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao repor as comparações.');
    }
  };

  const handleDeleteUser = async (targetUser: string) => {
    setDeletingUser(targetUser);
    setError(null);
    try {
      await deleteUser(targetUser);
      setConfirmDeleteUser(null);
      const nextFilter = selectedUser === targetUser ? 'all' : selectedUser;
      setSelectedUser(nextFilter);
      onUserDeleted(targetUser);
      await loadData(nextFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao eliminar o utilizador.');
    } finally {
      setDeletingUser(null);
    }
  };

  const handleClearSamples = async () => {
    try {
      await clearImages('samples');
      setConfirmClearSamples(false);
      await loadData(selectedUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover as imagens de amostra.');
    }
  };

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-8 sm:py-10 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#18181B]">
            Painel de Imagens Preferidas
          </h1>
          <p className="text-sm text-[#52525B] mt-1">
            {selectedUser === 'all'
              ? 'Classificação global entre todos os utilizadores por pontuação Elo, vitórias e taxa de vitória.'
              : `A visualizar a classificação específica de ${selectedUser}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Per-user ranking selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="user-ranking-select" className="text-xs font-medium text-[#52525B]">
              Classificação de:
            </label>
            <select
              id="user-ranking-select"
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                setConfirmReset(false);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-zinc-300 rounded-lg text-[#18181B] focus:outline-none focus:border-[#2563EB] cursor-pointer"
            >
              <option value="all">Todos os Utilizadores (Global)</option>
              {users.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.username}
                  {currentUsername === u.username ? ' (Tu)' : ''} — {u.totalVotes} votos
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowUsersPanel((v) => !v);
              setConfirmDeleteUser(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showUsersPanel
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-[#52525B] hover:text-[#18181B] border-zinc-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Gerir Utilizadores ({users.length})</span>
          </button>

          {hasSamples &&
            (confirmClearSamples ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#52525B]">Remover amostras?</span>
                <button
                  type="button"
                  onClick={handleClearSamples}
                  className="px-3 py-1.5 rounded-md bg-[#DC2626] text-white font-medium hover:bg-[#B91C1C] cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearSamples(false)}
                  className="px-2.5 py-1.5 rounded-md border border-zinc-300 text-[#52525B] hover:text-[#18181B] bg-white cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearSamples(true)}
                className="px-3 py-1.5 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-white border border-zinc-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Remover Amostras
              </button>
            ))}

          {images.length > 0 &&
            (confirmReset ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#52525B]">
                  {selectedUser === 'all'
                    ? 'Repor todas as comparações e Elo?'
                    : `Repor comparações de ${selectedUser}?`}
                </span>
                <button
                  type="button"
                  onClick={handleResetScores}
                  className="px-3 py-1.5 rounded-md bg-[#DC2626] text-white font-medium hover:bg-[#B91C1C] cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1.5 rounded-md border border-zinc-300 text-[#52525B] hover:text-[#18181B] bg-white cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-white border border-zinc-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {selectedUser === 'all'
                    ? 'Repor Comparações'
                    : `Repor Votos de ${selectedUser}`}
                </span>
              </button>
            ))}
        </div>
      </div>

      {/* Collapsible User Management Panel */}
      {showUsersPanel && (
        <section
          aria-label="Gestão de utilizadores"
          className="border border-zinc-200 rounded-xl bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Utilizadores Registados
              </h2>
              <p className="text-xs text-[#52525B] mt-0.5">
                Eliminar um utilizador remove os respetivos votos e estatísticas individuais da base de dados.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUsersPanel(false)}
              aria-label="Fechar gestão de utilizadores"
              className="p-1.5 rounded-lg text-[#52525B] hover:text-[#18181B] hover:bg-zinc-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-[#52525B] py-2">
              Ainda não existem utilizadores com votos registados.
            </p>
          ) : (
            <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg">
              {users.map((u) => (
                <div
                  key={u.username}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-[#18181B]">
                      {u.username}
                      {currentUsername === u.username ? ' (Sessão atual)' : ''}
                    </span>
                    <span aria-hidden="true" className="text-zinc-300">
                      ·
                    </span>
                    <span className="font-mono text-xs text-[#52525B] tabular-nums">
                      {u.totalVotes} {u.totalVotes === 1 ? 'comparação' : 'comparações'}
                    </span>
                  </div>

                  {confirmDeleteUser === u.username ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#52525B]">Eliminar este utilizador?</span>
                      <button
                        type="button"
                        disabled={deletingUser === u.username}
                        onClick={() => handleDeleteUser(u.username)}
                        className="px-3 py-1 rounded-md bg-[#DC2626] text-white font-medium hover:bg-[#B91C1C] cursor-pointer disabled:opacity-50"
                      >
                        {deletingUser === u.username ? 'A eliminar…' : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUser(null)}
                        className="px-2.5 py-1 rounded-md border border-zinc-300 text-[#52525B] hover:text-[#18181B] bg-white cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteUser(u.username)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#DC2626] border border-[#DC2626]/30 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Utilizador</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Upload Dropzone */}
      <UploadDropzone
        onUploaded={() => loadData(selectedUser)}
        externalTriggerCount={uploadTriggerCount}
      />

      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/10 text-sm text-[#DC2626]"
        >
          {error}
        </div>
      )}

      {/* 4-column flat summary metric strip */}
      <section
        aria-label="Resumo da pilha"
        className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-200 rounded-xl bg-white divide-y lg:divide-y-0 lg:divide-x divide-zinc-200"
      >
        <div className="p-5">
          <div className="text-xs text-[#52525B]">Imagens na Pilha</div>
          <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums mt-1">
            {images.length}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-[#52525B]">
            {selectedUser === 'all' ? 'Total de Comparações' : `Votos de ${selectedUser}`}
          </div>
          <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums mt-1">
            {totalVotes}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-[#52525B]">Elo Mais Alto</div>
          <div className="font-mono text-2xl font-semibold text-[#2563EB] tabular-nums mt-1">
            {topElo}
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-[#52525B]">Melhor Taxa de Vitória</div>
          <div className="font-mono text-2xl font-semibold text-[#18181B] tabular-nums mt-1">
            {bestWinRate}
          </div>
        </div>
      </section>

      {/* Toolbar: Search, Filter, Bulk Select/Delete, Sort, Layout Switch */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por nome…"
              aria-label="Filtrar imagens por nome"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div
            role="group"
            aria-label="Filtrar imagens"
            className="flex items-center gap-1 p-1 bg-white border border-zinc-200 rounded-lg"
          >
            {(['all', 'top', 'unrated'] as FilterOption[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilterOption(opt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterOption === opt
                    ? 'bg-zinc-900 text-white'
                    : 'text-[#52525B] hover:text-[#18181B]'
                }`}
              >
                {opt === 'all' ? 'Todas' : opt === 'top' ? 'Top 10' : 'Sem avaliação'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {filteredAndSorted.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="px-3 py-2 text-xs font-medium bg-white border border-zinc-300 rounded-lg text-[#18181B] hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {allFilteredSelected ? 'Desmarcar Todas' : 'Selecionar Todas'}
            </button>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {confirmBulkDelete ? (
                <>
                  <button
                    type="button"
                    disabled={isBulkDeleting}
                    onClick={handleBulkDelete}
                    className="px-3 py-2 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isBulkDeleting
                      ? 'A eliminar…'
                      : `Confirmar Eliminação (${selectedIds.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(false)}
                    className="px-2.5 py-2 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-white border border-zinc-300 rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Selecionadas ({selectedIds.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="px-2.5 py-2 text-xs font-medium text-[#52525B] hover:text-[#18181B] bg-white border border-zinc-300 rounded-lg cursor-pointer"
                  >
                    Limpar
                  </button>
                </>
              )}
            </div>
          )}

          <select
            aria-label="Ordenar imagens"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="px-3 py-2 text-xs font-medium bg-white border border-zinc-300 rounded-lg text-[#18181B] focus:outline-none focus:border-[#2563EB] cursor-pointer"
          >
            <option value="elo">Ordenar: Maior Elo</option>
            <option value="wins">Ordenar: Mais Vitórias</option>
            <option value="winRate">Ordenar: Taxa de Vitória</option>
            <option value="newest">Ordenar: Mais Recentes</option>
          </select>

          <div className="flex items-center gap-1 p-1 bg-white border border-zinc-200 rounded-lg">
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              aria-label="Vista em grelha"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                layoutMode === 'grid'
                  ? 'bg-zinc-900 text-white'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('table')}
              aria-label="Vista em tabela"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                layoutMode === 'table'
                  ? 'bg-zinc-900 text-white'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Rankings Content */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-xl bg-zinc-200/70 border border-zinc-200 animate-pulse"
            />
          ))}
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="border border-zinc-200 rounded-xl bg-white p-12 text-center">
          <p className="text-sm text-[#52525B]">
            {images.length === 0
              ? 'Ainda não existem imagens na base de dados. Carregue imagens acima para começar.'
              : 'Nenhuma imagem corresponde ao filtro atual.'}
          </p>
        </div>
      ) : layoutMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredAndSorted.map((img) => {
            const rank = rankById.get(img.id) ?? 0;
            const winRate = getWinRate(img);
            const totalMatches = img.wins + img.losses;
            const isSelected = selectedIds.has(img.id);

            return (
              <article
                key={img.id}
                className={`group rounded-xl border bg-white overflow-hidden flex flex-col transition-colors ${
                  isSelected
                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
                    : 'border-zinc-200'
                }`}
              >
                <div className="relative aspect-[3/4] w-full bg-zinc-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLightboxImage(img)}
                    className="w-full h-full block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    <DashboardImage src={img.url} alt={img.title} />
                  </button>

                  <div className="absolute inset-x-0 top-0 p-3 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Selecionar ${img.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(img.id);
                        }}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#2563EB] border-[#2563EB] text-white'
                            : 'bg-white/90 border-zinc-300 text-transparent hover:border-[#2563EB]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                      <span className="font-mono text-xs font-semibold text-white tabular-nums">
                        #{rank}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-semibold text-white tabular-nums">
                      {Math.round(img.elo)} Elo
                    </span>
                  </div>
                </div>

                <div className="p-4 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-[#18181B] truncate">{img.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-[#52525B] font-mono tabular-nums mt-1">
                      <span>
                        {img.wins}V – {img.losses}D
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{totalMatches > 0 ? `${winRate}%` : 'Sem avaliação'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={resettingImageId === img.id || totalMatches === 0}
                      onClick={() => handleResetSingleImage(img.id)}
                      title="Repor comparações desta imagem"
                      aria-label={`Repor comparações de ${img.title}`}
                      className="p-2 rounded-lg text-[#71717A] hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === img.id}
                      onClick={() => handleDelete(img.id)}
                      title="Eliminar imagem"
                      aria-label={`Eliminar ${img.title}`}
                      className="p-2 rounded-lg text-[#71717A] hover:text-[#DC2626] hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-xl bg-white overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-[#52525B] bg-zinc-50/70">
                <th className="py-3 px-4 w-10">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={allFilteredSelected}
                    aria-label="Selecionar todas as imagens visíveis"
                    onClick={toggleSelectAllFiltered}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                      allFilteredSelected
                        ? 'bg-[#2563EB] border-[#2563EB] text-white'
                        : 'bg-white border-zinc-300 text-transparent hover:border-[#2563EB]'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </th>
                <th className="py-3 px-4 font-medium">Posição</th>
                <th className="py-3 px-4 font-medium">Imagem</th>
                <th className="py-3 px-4 font-medium text-right">Elo</th>
                <th className="py-3 px-4 font-medium text-right">Vitórias</th>
                <th className="py-3 px-4 font-medium text-right">Derrotas</th>
                <th className="py-3 px-4 font-medium text-right">Taxa</th>
                <th className="py-3 px-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-sm">
              {filteredAndSorted.map((img) => {
                const rank = rankById.get(img.id) ?? 0;
                const totalMatches = img.wins + img.losses;
                const isSelected = selectedIds.has(img.id);

                return (
                  <tr
                    key={img.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-[#2563EB]/[0.04]' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={`Selecionar ${img.title}`}
                        onClick={() => toggleSelect(img.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#2563EB] border-[#2563EB] text-white'
                            : 'bg-white border-zinc-300 text-transparent hover:border-[#2563EB]'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-[#52525B] tabular-nums">
                      #{rank}
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => setLightboxImage(img)}
                        className="flex items-center gap-3 text-left cursor-pointer group"
                      >
                        <img
                          src={img.url}
                          alt={img.title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-12 rounded object-cover bg-zinc-100 border border-zinc-200 shrink-0"
                        />
                        <span className="font-medium text-[#18181B] group-hover:underline truncate max-w-[260px]">
                          {img.title}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#2563EB] tabular-nums">
                      {Math.round(img.elo)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#18181B] tabular-nums">
                      {img.wins}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#52525B] tabular-nums">
                      {img.losses}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#18181B] tabular-nums">
                      {totalMatches > 0 ? `${getWinRate(img)}%` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={resettingImageId === img.id || totalMatches === 0}
                          onClick={() => handleResetSingleImage(img.id)}
                          title="Repor comparações desta imagem"
                          aria-label={`Repor comparações de ${img.title}`}
                          className="p-1.5 rounded-md text-[#71717A] hover:text-[#2563EB] hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === img.id}
                          onClick={() => handleDelete(img.id)}
                          title="Eliminar imagem"
                          aria-label={`Eliminar ${img.title}`}
                          className="p-1.5 rounded-md text-[#71717A] hover:text-[#DC2626] hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Fullscreen Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.title}
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Fechar pré-visualização"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 text-[#18181B] hover:bg-white border border-zinc-200 flex items-center justify-center cursor-pointer shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="bg-zinc-100 max-h-[70vh] flex items-center justify-center overflow-hidden">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 bg-white">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#18181B]">
                  {lightboxImage.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-[#52525B] font-mono tabular-nums mt-1">
                  <span>Posição #{rankById.get(lightboxImage.id) ?? '—'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#2563EB] font-semibold">
                    {Math.round(lightboxImage.elo)} Elo
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {lightboxImage.wins}V – {lightboxImage.losses}D ({getWinRate(lightboxImage)}%)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    resettingImageId === lightboxImage.id ||
                    lightboxImage.wins + lightboxImage.losses === 0
                  }
                  onClick={() => handleResetSingleImage(lightboxImage.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#18181B] border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Repor Comparações</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(lightboxImage.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#DC2626] border border-[#DC2626]/30 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

const DashboardImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-zinc-100">
        <ImageOff className="w-6 h-6 text-[#71717A] mb-2" />
        <span className="text-xs text-[#52525B] line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
};
