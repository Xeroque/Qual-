import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ImageOff, ArrowRight, User } from 'lucide-react';
import { fetchInitStack, fetchNextCards, fetchUsers, submitVote } from '../api';
import type { ImageItem, UserSummary } from '../types';

interface VotingArenaProps {
  username: string | null;
  onSetUsername: (name: string) => void;
  onClearUsername: () => void;
  onOpenDashboard: () => void;
}

interface SlotStack {
  front: ImageItem | null;
  back: ImageItem | null;
}

interface CardFaceProps {
  image: ImageItem;
  role: 'front' | 'back';
  swipeDirection: 'left' | 'right' | null;
  isWinnerPop: boolean;
  isRevealing: boolean;
}

const CardFace: React.FC<CardFaceProps> = ({
  image,
  role,
  swipeDirection,
  isWinnerPop,
  isRevealing,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [image.id, image.url]);

  const baseClasses =
    'absolute inset-0 rounded-2xl overflow-hidden bg-white border border-zinc-200 select-none will-change-transform';

  let transformStyle = '';
  if (role === 'front') {
    if (swipeDirection === 'left') {
      transformStyle =
        'z-20 pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] -translate-x-[128%] -rotate-12 opacity-0 shadow-lg';
    } else if (swipeDirection === 'right') {
      transformStyle =
        'z-20 pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] translate-x-[128%] rotate-12 opacity-0 shadow-lg';
    } else if (isWinnerPop) {
      transformStyle =
        'z-20 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] scale-[1.03] shadow-xl';
    } else {
      transformStyle =
        'z-20 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5 shadow-[0_18px_40px_-15px_rgba(0,0,0,0.2)]';
    }
  } else {
    transformStyle = isRevealing
      ? 'z-10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] scale-100 translate-y-0 brightness-100'
      : 'z-10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] scale-[0.95] translate-y-2.5 brightness-[0.9]';
  }

  return (
    <div className={`${baseClasses} ${transformStyle}`}>
      {imgError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-zinc-100">
          <ImageOff className="w-8 h-8 text-[#71717A] mb-2" />
          <p className="text-xs font-medium text-[#52525B]">Imagem indisponível</p>
        </div>
      ) : (
        <img
          src={image.url}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover block pointer-events-none"
        />
      )}
    </div>
  );
};

export const VotingArena: React.FC<VotingArenaProps> = ({
  username,
  onSetUsername,
  onClearUsername,
  onOpenDashboard,
}) => {
  const [leftSlot, setLeftSlot] = useState<SlotStack>({ front: null, back: null });
  const [rightSlot, setRightSlot] = useState<SlotStack>({ front: null, back: null });
  const [totalImages, setTotalImages] = useState(0);
  const [totalVotes, setTotalVotes] = useState(0);
  const [userVotes, setUserVotes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [knownUsers, setKnownUsers] = useState<UserSummary[]>([]);

  const [swipingSide, setSwipingSide] = useState<'left' | 'right' | null>(null);
  const [winnerSide, setWinnerSide] = useState<'left' | 'right' | null>(null);
  const lockRef = useRef(false);

  const loadKnownUsers = useCallback(async () => {
    try {
      const res = await fetchUsers();
      setKnownUsers(res.users);
    } catch {
      // Non-blocking
    }
  }, []);

  const loadInitialStack = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInitStack(username ?? undefined);
      setTotalImages(data.totalImages);
      setTotalVotes(data.totalVotes);
      setUserVotes(data.userVotes);

      if (data.images.length >= 2) {
        setLeftSlot({
          front: data.images[0],
          back: data.images[2] ?? data.images[1],
        });
        setRightSlot({
          front: data.images[1],
          back: data.images[3] ?? data.images[0],
        });
      } else {
        setLeftSlot({ front: null, back: null });
        setRightSlot({ front: null, back: null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a pilha de imagens.');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    loadKnownUsers();
  }, [loadKnownUsers]);

  useEffect(() => {
    if (username) {
      loadInitialStack();
    } else {
      setLoading(false);
      loadKnownUsers();
    }
  }, [username, loadInitialStack, loadKnownUsers]);

  const handleSubmitUsername = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      setNameError('Introduza um nome de utilizador para começar a votar.');
      return;
    }
    setNameError(null);
    setDraftName('');
    onSetUsername(cleaned);
  };

  const handleChoose = useCallback(
    async (chosenSide: 'left' | 'right') => {
      if (!username || lockRef.current) return;
      const winnerCard = chosenSide === 'left' ? leftSlot.front : rightSlot.front;
      const loserSide = chosenSide === 'left' ? 'right' : 'left';
      const loserCard = loserSide === 'left' ? leftSlot.front : rightSlot.front;

      if (!winnerCard || !loserCard) return;

      lockRef.current = true;
      setWinnerSide(chosenSide);
      setSwipingSide(loserSide);

      const excludeIds = [
        leftSlot.front?.id,
        leftSlot.back?.id,
        rightSlot.front?.id,
        rightSlot.back?.id,
      ].filter((id): id is string => Boolean(id));

      try {
        const [voteData] = await Promise.all([
          submitVote(winnerCard.id, loserCard.id, username, excludeIds),
          new Promise((resolve) => setTimeout(resolve, 330)),
        ]);

        setTotalVotes(voteData.totalVotes);
        setUserVotes(voteData.userVotes);
        setTotalImages(voteData.totalImages);

        if (loserSide === 'right') {
          setRightSlot((prev) => ({
            front: prev.back ?? voteData.nextImage,
            back: voteData.nextImage ?? prev.front,
          }));
        } else {
          setLeftSlot((prev) => ({
            front: prev.back ?? voteData.nextImage,
            back: voteData.nextImage ?? prev.front,
          }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao registar a preferência.');
      } finally {
        setSwipingSide(null);
        setWinnerSide(null);
        lockRef.current = false;
      }
    },
    [leftSlot, rightSlot, username],
  );

  const handleSkipPair = useCallback(async () => {
    if (!username || lockRef.current || totalImages < 2) return;
    lockRef.current = true;
    try {
      const currentIds = [leftSlot.front?.id, rightSlot.front?.id].filter((id): id is string =>
        Boolean(id),
      );
      const data = await fetchNextCards(4, currentIds);
      if (data.images.length >= 2) {
        setLeftSlot({
          front: data.images[0],
          back: data.images[2] ?? data.images[1],
        });
        setRightSlot({
          front: data.images[1],
          back: data.images[3] ?? data.images[0],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o par seguinte.');
    } finally {
      lockRef.current = false;
    }
  }, [leftSlot.front?.id, rightSlot.front?.id, totalImages, username]);

  useEffect(() => {
    if (!username) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleChoose('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleChoose('right');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleChoose, username]);

  if (!username) {
    return (
      <main className="max-w-[540px] mx-auto px-6 py-16 sm:py-24">
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm">
          <div className="w-11 h-11 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[#18181B] mb-5">
            <User className="w-5 h-5" />
          </div>

          <h1
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#18181B]"
            style={{ textWrap: 'balance' }}
          >
            Identifique-se para votar
          </h1>
          <p className="text-sm text-[#52525B] mt-2 leading-relaxed">
            Introduza um nome de utilizador para que as suas preferências fiquem guardadas na sua
            própria classificação no painel. Não precisa de palavra-passe.
          </p>

          <form onSubmit={handleSubmitUsername} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="voter-username"
                className="block text-xs font-medium text-[#52525B] mb-1.5"
              >
                Nome de utilizador
              </label>
              <input
                id="voter-username"
                type="text"
                autoFocus
                maxLength={40}
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="ex.: Ana, João, Equipa…"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-zinc-300 rounded-lg text-[#18181B] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
              {nameError && (
                <p role="alert" className="text-xs text-[#DC2626] mt-1.5">
                  {nameError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]"
            >
              Continuar para a Votação
            </button>
          </form>

          {knownUsers.length > 0 && (
            <div className="mt-6 pt-5 border-t border-zinc-200">
              <div className="text-xs font-medium text-[#52525B] mb-2.5">
                Ou continue como utilizador existente
              </div>
              <div className="flex flex-wrap gap-2">
                {knownUsers.map((u) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => onSetUsername(u.username)}
                    className="px-3 py-1.5 text-xs font-medium text-[#18181B] bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {u.username}{' '}
                    <span className="font-mono text-[#52525B] tabular-nums">
                      ({u.totalVotes})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-[1100px] mx-auto px-6 py-12 flex flex-col items-center">
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#18181B]">
            Qual?
          </h1>
          <p className="text-sm text-[#52525B] mt-2">A preparar as pilhas de cartões…</p>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:gap-10 w-full max-w-[820px]">
          <div className="aspect-[3/4] rounded-2xl bg-zinc-200/80 border border-zinc-200 animate-pulse" />
          <div className="aspect-[3/4] rounded-2xl bg-zinc-200/80 border border-zinc-200 animate-pulse" />
        </div>
      </main>
    );
  }

  if (totalImages < 2) {
    return (
      <main className="max-w-[720px] mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-[#18181B] mb-4">
          Qual?
        </h1>
        <p className="text-base text-[#52525B] mb-8">
          A sua pilha precisa de pelo menos duas imagens para iniciar as comparações. Carregue
          imagens no Painel para começar a votar.
        </p>
        <button
          type="button"
          onClick={onOpenDashboard}
          className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors cursor-pointer"
        >
          <span>Ir para o Painel de Carregamento</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-8 sm:py-12 flex flex-col items-center">
      <header className="text-center mb-8 sm:mb-10">
        <h1
          className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#18181B]"
          style={{ textWrap: 'balance' }}
        >
          Qual?
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm text-[#52525B] mt-3">
          <span>
            A votar como <strong className="font-semibold text-[#18181B]">{username}</strong>
          </span>
          <button
            type="button"
            onClick={onClearUsername}
            className="text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
          >
            Alterar utilizador
          </button>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{userVotes} seus votos</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{totalVotes} total</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{totalImages} imagens</span>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 px-4 py-2.5 rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/10 text-sm text-[#DC2626]"
        >
          {error}
        </div>
      )}

      {/* Dual Stacked Card Arena — picture names intentionally hidden */}
      <div className="grid grid-cols-2 gap-4 sm:gap-10 w-full max-w-[820px] items-center">
        {/* Left Stack */}
        <button
          type="button"
          onClick={() => handleChoose('left')}
          aria-label="Escolher imagem da esquerda"
          className="group relative w-full aspect-[3/4] text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-2xl"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-zinc-200/80 border border-zinc-300/70 scale-[0.90] translate-y-5 opacity-80 pointer-events-none"
          />
          {leftSlot.back && (
            <CardFace
              key={`left-back-${leftSlot.back.id}`}
              image={leftSlot.back}
              role="back"
              swipeDirection={null}
              isWinnerPop={false}
              isRevealing={swipingSide === 'left'}
            />
          )}
          {leftSlot.front && (
            <CardFace
              key={`left-front-${leftSlot.front.id}`}
              image={leftSlot.front}
              role="front"
              swipeDirection={swipingSide === 'left' ? 'left' : null}
              isWinnerPop={winnerSide === 'left'}
              isRevealing={false}
            />
          )}
        </button>

        {/* Right Stack */}
        <button
          type="button"
          onClick={() => handleChoose('right')}
          aria-label="Escolher imagem da direita"
          className="group relative w-full aspect-[3/4] text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-2xl"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl bg-zinc-200/80 border border-zinc-300/70 scale-[0.90] translate-y-5 opacity-80 pointer-events-none"
          />
          {rightSlot.back && (
            <CardFace
              key={`right-back-${rightSlot.back.id}`}
              image={rightSlot.back}
              role="back"
              swipeDirection={null}
              isWinnerPop={false}
              isRevealing={swipingSide === 'right'}
            />
          )}
          {rightSlot.front && (
            <CardFace
              key={`right-front-${rightSlot.front.id}`}
              image={rightSlot.front}
              role="front"
              swipeDirection={swipingSide === 'right' ? 'right' : null}
              isWinnerPop={winnerSide === 'right'}
              isRevealing={false}
            />
          )}
        </button>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-[#52525B]">
        <span>Clique num cartão ou prima ← / → para votar</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={handleSkipPair}
          className="inline-flex items-center gap-1.5 text-[#18181B] hover:text-[#2563EB] transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Saltar par</span>
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onOpenDashboard}
          className="text-[#18181B] hover:text-[#2563EB] transition-colors cursor-pointer"
        >
          Ver Classificações →
        </button>
      </div>
    </main>
  );
};
