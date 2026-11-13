import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

interface UserImageStat {
  wins: number;
  losses: number;
  elo: number;
}

interface ImageRecord {
  id: string;
  filename: string;
  title: string;
  wins: number;
  losses: number;
  elo: number;
  userStats: Record<string, UserImageStat>;
  isSample: boolean;
  createdAt: string;
}

interface StoreData {
  seeded: boolean;
  totalVotes: number;
  userVotes: Record<string, number>;
  images: ImageRecord[];
}

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const SEED_DIR = path.join(ROOT_DIR, 'src', 'assets', 'images');

const VALID_IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg|heic|heif)$/i;

const SAMPLE_TITLES: Record<string, string> = {
  sample_brutalist_concrete: 'Escadaria em Betão ao Sol',
  sample_coastal_dusk: 'Costa Vulcânica ao Crepúsculo',
  sample_ceramic_vessel: 'Vaso de Cerâmica Mate',
  sample_alpine_ridge: 'Crista Alpina Matinal',
  sample_botanical_shadow: 'Estudo de Luz e Monstera',
  sample_vinyl_lounge: 'Sala de Escuta em Nogueira',
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

let store: StoreData = { seeded: false, totalVotes: 0, userVotes: {}, images: [] };
let writeQueue: Promise<void> = Promise.resolve();

function loadStoreFromDisk(): StoreData {
  if (!fs.existsSync(DB_FILE)) {
    return { seeded: false, totalVotes: 0, userVotes: {}, images: [] };
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const normalizedImages: ImageRecord[] = Array.isArray(parsed.images)
      ? parsed.images.map((img) => ({
          ...img,
          userStats: img.userStats && typeof img.userStats === 'object' ? img.userStats : {},
        }))
      : [];

    return {
      seeded: Boolean(parsed.seeded),
      totalVotes: typeof parsed.totalVotes === 'number' ? parsed.totalVotes : 0,
      userVotes:
        parsed.userVotes && typeof parsed.userVotes === 'object' ? parsed.userVotes : {},
      images: normalizedImages,
    };
  } catch (err) {
    console.error('Failed to parse store.json, starting fresh:', err);
    return { seeded: false, totalVotes: 0, userVotes: {}, images: [] };
  }
}

function saveStore(): Promise<void> {
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue
    .then(async () => {
      const tmpFile = `${DB_FILE}.tmp`;
      await fs.promises.writeFile(tmpFile, snapshot, 'utf-8');
      await fs.promises.rename(tmpFile, DB_FILE);
    })
    .catch((err) => {
      console.error('Failed to persist store.json:', err);
    });
  return writeQueue;
}

function formatTitleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  for (const [prefix, label] of Object.entries(SAMPLE_TITLES)) {
    if (base.startsWith(prefix)) return label;
  }
  const cleaned = base
    .replace(/-\d{10,}-\d+$/, '')
    .replace(/^\d{10,}-\d+-?/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return 'Imagem sem título';
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUsername(raw?: string): string {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return trimmed || 'Convidado';
}

async function seedInitialImagesIfNeeded(): Promise<void> {
  if (store.seeded || store.images.length > 0) return;
  if (!fs.existsSync(SEED_DIR)) {
    store.seeded = true;
    await saveStore();
    return;
  }

  const seedFiles = fs.readdirSync(SEED_DIR).filter((f) => VALID_IMAGE_EXT.test(f));
  for (const file of seedFiles) {
    const srcPath = path.join(SEED_DIR, file);
    const destPath = path.join(UPLOAD_DIR, file);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
    store.images.push({
      id: makeId(),
      filename: file,
      title: formatTitleFromFilename(file),
      wins: 0,
      losses: 0,
      elo: 1200,
      userStats: {},
      isSample: true,
      createdAt: new Date().toISOString(),
    });
  }
  store.seeded = true;
  await saveStore();
}

async function syncUploadsFolder(): Promise<void> {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  const filesOnDisk = fs.readdirSync(UPLOAD_DIR).filter((f) => VALID_IMAGE_EXT.test(f));
  const diskSet = new Set(filesOnDisk);

  let changed = false;

  const prevLen = store.images.length;
  store.images = store.images.filter((img) => diskSet.has(img.filename));
  if (store.images.length !== prevLen) {
    changed = true;
  }

  const existingFilenames = new Set(store.images.map((img) => img.filename));
  for (const file of filesOnDisk) {
    if (!existingFilenames.has(file)) {
      store.images.push({
        id: makeId(),
        filename: file,
        title: formatTitleFromFilename(file),
        wins: 0,
        losses: 0,
        elo: 1200,
        userStats: {},
        isSample: false,
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) {
    await saveStore();
  }
}

function serializeImage(img: ImageRecord, selectedUser = 'all') {
  const userStat =
    selectedUser !== 'all' ? img.userStats?.[selectedUser] : undefined;

  return {
    id: img.id,
    filename: img.filename,
    title: img.title,
    url: `/uploads/${encodeURIComponent(img.filename)}`,
    wins: selectedUser === 'all' ? img.wins : (userStat?.wins ?? 0),
    losses: selectedUser === 'all' ? img.losses : (userStat?.losses ?? 0),
    elo: selectedUser === 'all' ? img.elo : (userStat?.elo ?? 1200),
    isSample: img.isSample,
    createdAt: img.createdAt,
  };
}

function getUsersList() {
  return Object.entries(store.userVotes)
    .map(([username, totalVotes]) => ({ username, totalVotes }))
    .sort((a, b) => b.totalVotes - a.totalVotes || a.username.localeCompare(b.username));
}

function pickBalancedRandomImages(
  pool: ImageRecord[],
  count: number,
  excludeIds: Set<string>,
): ImageRecord[] {
  const candidates = pool.filter((img) => !excludeIds.has(img.id));
  if (candidates.length === 0) return [];

  const weighted = candidates
    .map((img) => ({
      img,
      score: (img.wins + img.losses) * 0.65 + Math.random() * 4,
    }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.img);

  return weighted.slice(0, count);
}

function calculateElo(winnerElo: number, loserElo: number, k = 32) {
  const expectedWin = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLose = 1 - expectedWin;
  return {
    newWinnerElo: winnerElo + k * (1 - expectedWin),
    newLoserElo: Math.max(100, loserElo + k * (0 - expectedLose)),
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48);
    const safeBase = baseName || 'imagem';
    const unique = `${safeBase}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext.toLowerCase()}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 200,
  },
  fileFilter: (_req, file, cb) => {
    const isImageMime = file.mimetype.startsWith('image/');
    const isImageExt = VALID_IMAGE_EXT.test(file.originalname);
    if (isImageMime || isImageExt) {
      cb(null, true);
    } else {
      cb(new Error(`Formato não suportado ("${file.originalname}"). Envie apenas ficheiros de imagem.`));
    }
  },
});

async function startServer() {
  store = loadStoreFromDisk();
  await seedInitialImagesIfNeeded();
  await syncUploadsFolder();

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));

  app.get('/api/users', (_req: Request, res: Response) => {
    res.json({ users: getUsersList() });
  });

  // Delete a specific user and their recorded votes/stats
  app.delete('/api/users/:username', async (req: Request, res: Response) => {
    const targetUsername = decodeURIComponent(req.params.username ?? '').trim();
    if (!targetUsername || !(targetUsername in store.userVotes)) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    const removedVotes = store.userVotes[targetUsername] ?? 0;
    delete store.userVotes[targetUsername];
    store.totalVotes = Math.max(0, store.totalVotes - removedVotes);

    for (const img of store.images) {
      const uStat = img.userStats?.[targetUsername];
      if (uStat) {
        img.wins = Math.max(0, img.wins - uStat.wins);
        img.losses = Math.max(0, img.losses - uStat.losses);
        delete img.userStats[targetUsername];
        if (img.wins + img.losses === 0) {
          img.elo = 1200;
        }
      }
    }

    await saveStore();
    res.json({ deleted: true, username: targetUsername });
  });

  app.get('/api/init-stack', async (req: Request, res: Response) => {
    await syncUploadsFolder();
    const userParam = typeof req.query.user === 'string' ? req.query.user.trim() : '';
    const picked = pickBalancedRandomImages(store.images, 4, new Set());
    const userVoteCount = userParam ? (store.userVotes[userParam] ?? 0) : store.totalVotes;

    res.json({
      images: picked.map((img) => serializeImage(img, userParam || 'all')),
      totalImages: store.images.length,
      totalVotes: store.totalVotes,
      userVotes: userVoteCount,
    });
  });

  app.get('/api/next', async (req: Request, res: Response) => {
    await syncUploadsFolder();
    const count = Math.min(4, Math.max(1, Number(req.query.count) || 1));
    const excludeParam = typeof req.query.exclude === 'string' ? req.query.exclude : '';
    const excludeIds = new Set(excludeParam.split(',').map((s) => s.trim()).filter(Boolean));

    let picked = pickBalancedRandomImages(store.images, count, excludeIds);
    if (picked.length < count && store.images.length >= count) {
      const used = new Set(picked.map((p) => p.id));
      const fallback = pickBalancedRandomImages(store.images, count - picked.length, used);
      picked = [...picked, ...fallback];
    }

    res.json({
      images: picked.map((img) => serializeImage(img, 'all')),
      totalImages: store.images.length,
      totalVotes: store.totalVotes,
    });
  });

  app.post('/api/vote', async (req: Request, res: Response) => {
    try {
      const { winnerId, loserId, username: rawUsername, excludeIds = [] } = req.body as {
        winnerId?: string;
        loserId?: string;
        username?: string;
        excludeIds?: string[];
      };

      if (!winnerId || !loserId) {
        return res.status(400).json({ error: 'São necessários os IDs da imagem vencedora e vencida.' });
      }

      const username = normalizeUsername(rawUsername);
      const winner = store.images.find((img) => img.id === winnerId);
      const loser = store.images.find((img) => img.id === loserId);

      if (!winner || !loser) {
        return res.status(404).json({ error: 'Uma ou ambas as imagens não foram encontradas.' });
      }

      const { newWinnerElo, newLoserElo } = calculateElo(winner.elo, loser.elo);
      winner.wins += 1;
      winner.elo = newWinnerElo;
      loser.losses += 1;
      loser.elo = newLoserElo;
      store.totalVotes += 1;

      if (!winner.userStats) winner.userStats = {};
      if (!loser.userStats) loser.userStats = {};

      const prevWinUser = winner.userStats[username] ?? { wins: 0, losses: 0, elo: 1200 };
      const prevLoseUser = loser.userStats[username] ?? { wins: 0, losses: 0, elo: 1200 };
      const userEloUpdate = calculateElo(prevWinUser.elo, prevLoseUser.elo);

      winner.userStats[username] = {
        wins: prevWinUser.wins + 1,
        losses: prevWinUser.losses,
        elo: userEloUpdate.newWinnerElo,
      };
      loser.userStats[username] = {
        wins: prevLoseUser.wins,
        losses: prevLoseUser.losses + 1,
        elo: userEloUpdate.newLoserElo,
      };
      store.userVotes[username] = (store.userVotes[username] ?? 0) + 1;

      await saveStore();

      const excludeSet = new Set<string>([...excludeIds, winnerId, loserId]);
      let nextChoices = pickBalancedRandomImages(store.images, 1, excludeSet);

      if (nextChoices.length === 0) {
        nextChoices = pickBalancedRandomImages(store.images, 1, new Set([winnerId]));
      }
      if (nextChoices.length === 0 && store.images.length > 0) {
        nextChoices = [store.images[0]];
      }

      res.json({
        nextImage: nextChoices[0] ? serializeImage(nextChoices[0], username) : null,
        winner: serializeImage(winner, username),
        loser: serializeImage(loser, username),
        totalVotes: store.totalVotes,
        userVotes: store.userVotes[username],
        totalImages: store.images.length,
      });
    } catch (err) {
      console.error('Vote error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao registar o voto.' });
    }
  });

  app.get('/api/dashboard', async (req: Request, res: Response) => {
    await syncUploadsFolder();
    const rawUser = typeof req.query.user === 'string' ? req.query.user.trim() : 'all';
    const selectedUser = rawUser && rawUser !== 'all' ? rawUser : 'all';

    const mapped = store.images.map((img) => serializeImage(img, selectedUser));
    mapped.sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalVotes =
      selectedUser === 'all' ? store.totalVotes : (store.userVotes[selectedUser] ?? 0);

    res.json({
      selectedUser,
      users: getUsersList(),
      totalVotes,
      totalImages: store.images.length,
      images: mapped,
    });
  });

  app.post('/api/upload', (req: Request, res: Response) => {
    upload.array('pictures', 200)(req, res, async (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Erro durante o carregamento.';
        console.error('Multer upload error:', message);
        return res.status(400).json({ error: message });
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum ficheiro de imagem foi recebido pelo servidor.' });
      }

      try {
        const created: ImageRecord[] = [];
        for (const file of files) {
          const record: ImageRecord = {
            id: makeId(),
            filename: file.filename,
            title: formatTitleFromFilename(file.originalname || file.filename),
            wins: 0,
            losses: 0,
            elo: 1200,
            userStats: {},
            isSample: false,
            createdAt: new Date().toISOString(),
          };
          store.images.push(record);
          created.push(record);
        }

        await saveStore();
        return res.json({
          uploaded: created.length,
          images: created.map((img) => serializeImage(img, 'all')),
          totalImages: store.images.length,
        });
      } catch (saveErr) {
        console.error('Upload persistence error:', saveErr);
        return res.status(500).json({
          error: saveErr instanceof Error ? saveErr.message : 'Falha ao guardar as imagens carregadas.',
        });
      }
    });
  });

  // Reset comparisons for all pictures or a specific user
  app.post('/api/reset-scores', async (req: Request, res: Response) => {
    const targetUser =
      typeof req.body?.user === 'string' && req.body.user.trim() !== '' && req.body.user !== 'all'
        ? req.body.user.trim()
        : null;

    if (targetUser) {
      const userVotesToSubtract = store.userVotes[targetUser] ?? 0;
      store.totalVotes = Math.max(0, store.totalVotes - userVotesToSubtract);
      store.userVotes[targetUser] = 0;

      for (const img of store.images) {
        const uStat = img.userStats?.[targetUser];
        if (uStat) {
          img.wins = Math.max(0, img.wins - uStat.wins);
          img.losses = Math.max(0, img.losses - uStat.losses);
          delete img.userStats[targetUser];
          if (img.wins + img.losses === 0) {
            img.elo = 1200;
          }
        }
      }
    } else {
      for (const img of store.images) {
        img.wins = 0;
        img.losses = 0;
        img.elo = 1200;
        img.userStats = {};
      }
      store.totalVotes = 0;
      store.userVotes = {};
    }

    await saveStore();
    res.json({ reset: true });
  });

  // Reset comparisons for a single picture
  app.post('/api/images/:id/reset', async (req: Request, res: Response) => {
    const img = store.images.find((item) => item.id === req.params.id);
    if (!img) {
      return res.status(404).json({ error: 'Imagem não encontrada.' });
    }

    img.wins = 0;
    img.losses = 0;
    img.elo = 1200;
    img.userStats = {};

    await saveStore();
    res.json({ reset: true, image: serializeImage(img, 'all') });
  });

  // Bulk delete selected picture IDs at once
  app.post('/api/images/bulk-delete', async (req: Request, res: Response) => {
    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos uma imagem para eliminar.' });
    }

    const idSet = new Set(ids.filter((id): id is string => typeof id === 'string'));
    const toRemove = store.images.filter((img) => idSet.has(img.id));

    for (const img of toRemove) {
      const filePath = path.join(UPLOAD_DIR, img.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    store.images = store.images.filter((img) => !idSet.has(img.id));
    await saveStore();
    res.json({ deletedCount: toRemove.length });
  });

  app.delete('/api/images/:id', async (req: Request, res: Response) => {
    const idx = store.images.findIndex((img) => img.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Imagem não encontrada.' });
    }
    const [removed] = store.images.splice(idx, 1);
    const filePath = path.join(UPLOAD_DIR, removed.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await saveStore();
    res.json({ deleted: true, id: removed.id });
  });

  app.delete('/api/images', async (req: Request, res: Response) => {
    const scope = req.query.scope === 'samples' ? 'samples' : 'all';
    const toRemove = store.images.filter((img) => (scope === 'samples' ? img.isSample : true));
    for (const img of toRemove) {
      const filePath = path.join(UPLOAD_DIR, img.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    store.images = store.images.filter((img) => (scope === 'samples' ? !img.isSample : false));
    if (scope === 'all') {
      store.totalVotes = 0;
      store.userVotes = {};
    }
    await saveStore();
    res.json({ deletedCount: toRemove.length });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled Express error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno do servidor.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();
