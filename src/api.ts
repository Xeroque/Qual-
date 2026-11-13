import type {
  DashboardResponse,
  ImageItem,
  InitStackResponse,
  UserSummary,
  VoteResponse,
} from './types';

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.status === 413) {
        throw new Error('O ficheiro excede o limite de tamanho permitido pelo servidor (32 MB).');
      }
      throw new Error(`Resposta inesperada do servidor (${res.status}).`);
    }
  }
  if (!res.ok) {
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Pedido falhou com o estado ${res.status}.`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function fetchUsers(): Promise<{ users: UserSummary[] }> {
  const res = await fetch('/api/users', { cache: 'no-store' });
  return parseJsonOrThrow(res);
}

export async function deleteUser(username: string): Promise<void> {
  const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  });
  await parseJsonOrThrow(res);
}

export async function fetchInitStack(username?: string): Promise<InitStackResponse> {
  const query = username ? `?user=${encodeURIComponent(username)}` : '';
  const res = await fetch(`/api/init-stack${query}`, { cache: 'no-store' });
  return parseJsonOrThrow<InitStackResponse>(res);
}

export async function fetchNextCards(count: number, excludeIds: string[]): Promise<{
  images: ImageItem[];
  totalImages: number;
  totalVotes: number;
}> {
  const params = new URLSearchParams({
    count: String(count),
    exclude: excludeIds.join(','),
  });
  const res = await fetch(`/api/next?${params.toString()}`, { cache: 'no-store' });
  return parseJsonOrThrow(res);
}

export async function submitVote(
  winnerId: string,
  loserId: string,
  username: string,
  excludeIds: string[],
): Promise<VoteResponse> {
  const res = await fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winnerId, loserId, username, excludeIds }),
  });
  return parseJsonOrThrow<VoteResponse>(res);
}

export async function fetchDashboard(user = 'all'): Promise<DashboardResponse> {
  const params = new URLSearchParams({ user });
  const res = await fetch(`/api/dashboard?${params.toString()}`, { cache: 'no-store' });
  return parseJsonOrThrow<DashboardResponse>(res);
}

export interface UploadProgress {
  completedFiles: number;
  totalFiles: number;
  percent: number;
}

const OPTIMIZE_THRESHOLD_BYTES = 3.5 * 1024 * 1024; // 3.5 MB
const MAX_DIMENSION_PX = 2200;
const MAX_BATCH_BYTES = 4 * 1024 * 1024; // Keep every HTTP request well under 32 MB nginx/Cloud Run cap
const MAX_BATCH_FILES = 3;

async function optimizeImageIfLarge(file: File): Promise<File> {
  if (file.size <= OPTIMIZE_THRESHOLD_BYTES) {
    return file;
  }
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const stem = file.name.replace(/\.[^.]+$/, '') || 'imagem';
    return new File([blob], `${stem}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

function buildUploadBatches(files: File[]): File[][] {
  const batches: File[][] = [];
  let currentBatch: File[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const wouldExceedBytes = currentBatch.length > 0 && currentBytes + file.size > MAX_BATCH_BYTES;
    const wouldExceedCount = currentBatch.length >= MAX_BATCH_FILES;

    if (wouldExceedBytes || wouldExceedCount) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }

    currentBatch.push(file);
    currentBytes += file.size;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function uploadBatchViaFetch(batch: File[]): Promise<{ uploaded: number; images: ImageItem[] }> {
  const formData = new FormData();
  for (const file of batch) {
    formData.append('pictures', file, file.name);
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await parseJsonOrThrow<{ uploaded?: number; images?: ImageItem[] }>(res);
  return {
    uploaded: Number(data.uploaded ?? batch.length),
    images: Array.isArray(data.images) ? data.images : [],
  };
}

function uploadBatchXHR(
  batch: File[],
  onBatchProgress: (loadedRatio: number) => void,
): Promise<{ uploaded: number; images: ImageItem[] }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const file of batch) {
      formData.append('pictures', file, file.name);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.timeout = 120000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onBatchProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 413) {
        reject(new Error('O ficheiro excede o limite de tamanho permitido pelo servidor (32 MB).'));
        return;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        reject(new Error(`O servidor devolveu uma resposta inválida (${xhr.status}).`));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          uploaded: Number(parsed.uploaded ?? batch.length),
          images: Array.isArray(parsed.images) ? (parsed.images as ImageItem[]) : [],
        });
      } else {
        reject(
          new Error(
            typeof parsed.error === 'string'
              ? parsed.error
              : `O carregamento falhou com o estado ${xhr.status}.`,
          ),
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('NETWORK_ERROR'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Tempo limite excedido. Tente carregar menos imagens ou ficheiros mais leves de cada vez.'));
    };

    xhr.send(formData);
  });
}

async function uploadBatchResilient(
  batch: File[],
  onBatchProgress: (loadedRatio: number) => void,
): Promise<{ uploaded: number; images: ImageItem[] }> {
  try {
    return await uploadBatchXHR(batch, onBatchProgress);
  } catch (err) {
    const isNetworkErr = err instanceof Error && err.message === 'NETWORK_ERROR';
    if (!isNetworkErr) {
      throw err;
    }

    // Retry once via fetch after brief pause in case of transient HTTP/2 or proxy reset
    await new Promise((r) => setTimeout(r, 400));
    try {
      return await uploadBatchViaFetch(batch);
    } catch (retryErr) {
      if (retryErr instanceof TypeError) {
        throw new Error(
          'Erro de rede ao carregar os ficheiros. Verifique a ligação ou tente imagens mais pequenas.',
        );
      }
      throw retryErr;
    }
  }
}

export async function uploadPictures(
  files: File[],
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ uploaded: number; images: ImageItem[] }> {
  if (files.length === 0) {
    throw new Error('Nenhum ficheiro selecionado.');
  }

  const totalFiles = files.length;
  onProgress?.({ completedFiles: 0, totalFiles, percent: 2 });

  const preparedFiles: File[] = [];
  for (const file of files) {
    preparedFiles.push(await optimizeImageIfLarge(file));
  }

  const batches = buildUploadBatches(preparedFiles);
  let completedFiles = 0;
  const allUploaded: ImageItem[] = [];

  for (const batch of batches) {
    const result = await uploadBatchResilient(batch, (ratio) => {
      const currentProgress = completedFiles + ratio * batch.length;
      const percent = Math.min(99, Math.max(2, Math.round((currentProgress / totalFiles) * 100)));
      onProgress?.({
        completedFiles: Math.floor(currentProgress),
        totalFiles,
        percent,
      });
    });

    completedFiles += result.uploaded;
    allUploaded.push(...result.images);
    onProgress?.({
      completedFiles,
      totalFiles,
      percent: Math.round((completedFiles / totalFiles) * 100),
    });
  }

  return { uploaded: allUploaded.length, images: allUploaded };
}

export async function deleteImage(id: string): Promise<void> {
  const res = await fetch(`/api/images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJsonOrThrow(res);
}

export async function resetImageComparisons(id: string): Promise<void> {
  const res = await fetch(`/api/images/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
  });
  await parseJsonOrThrow(res);
}

export async function bulkDeleteImages(ids: string[]): Promise<{ deletedCount: number }> {
  const res = await fetch('/api/images/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return parseJsonOrThrow(res);
}

export async function clearImages(scope: 'samples' | 'all'): Promise<{ deletedCount: number }> {
  const res = await fetch(`/api/images?scope=${scope}`, {
    method: 'DELETE',
  });
  return parseJsonOrThrow(res);
}

export async function resetScores(user = 'all'): Promise<void> {
  const res = await fetch('/api/reset-scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user }),
  });
  await parseJsonOrThrow(res);
}
