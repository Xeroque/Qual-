import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { uploadPictures, type UploadProgress } from '../api';
import type { ImageItem } from '../types';

interface UploadDropzoneProps {
  onUploaded: (images: ImageItem[]) => void;
  externalTriggerCount?: number;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onUploaded,
  externalTriggerCount = 0,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList) return;
      const allFiles = Array.from(fileList);
      if (allFiles.length === 0) return;

      const validFiles = allFiles.filter(
        (f) =>
          f.type.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg|heic|heif)$/i.test(f.name),
      );

      if (validFiles.length === 0) {
        setErrorMessage('Não foram encontrados ficheiros de imagem válidos. Experimente JPG, PNG, WebP, GIF ou AVIF.');
        setStatusMessage(null);
        return;
      }

      setIsUploading(true);
      setErrorMessage(null);
      setStatusMessage(null);
      setProgress({ completedFiles: 0, totalFiles: validFiles.length, percent: 0 });

      try {
        const result = await uploadPictures(validFiles, (p) => {
          setProgress(p);
        });
        setStatusMessage(
          result.uploaded === 1
            ? 'Foi adicionada 1 imagem à pilha.'
            : `Foram adicionadas ${result.uploaded} imagens à pilha.`,
        );
        onUploaded(result.images);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'O carregamento falhou.');
      } finally {
        setIsUploading(false);
        setProgress(null);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    },
    [onUploaded],
  );

  useEffect(() => {
    if (externalTriggerCount > 0) {
      inputRef.current?.click();
    }
  }, [externalTriggerCount]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData?.files?.length) return;
      const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
      if (files.length > 0 && !isUploading) {
        handleFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFiles, isUploading]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <section aria-label="Carregar imagens" className="w-full">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-xl border transition-colors duration-150 p-6 sm:p-8 ${
          isDragging
            ? 'border-[#2563EB] bg-[#2563EB]/[0.05]'
            : 'border-dashed border-zinc-300 bg-white hover:border-zinc-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          aria-label="Escolher ficheiros de imagem"
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 text-[#52525B]">
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-[#18181B]">
                Adicionar Imagens às Pilhas
              </h2>
              <p className="text-sm text-[#52525B] mt-1">
                Arraste e largue várias imagens aqui, cole da área de transferência ou coloque os ficheiros diretamente em{' '}
                <code className="font-mono text-xs text-[#18181B] bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">
                  /uploads
                </code>
                .
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181B]"
            >
              {isUploading ? 'A carregar…' : 'Escolher Imagens'}
            </button>
          </div>
        </div>

        {isUploading && progress && (
          <div className="mt-5 pt-4 border-t border-zinc-200">
            <div className="flex items-center justify-between text-xs text-[#52525B] mb-2 font-mono tabular-nums">
              <span>
                A enviar {progress.completedFiles} de {progress.totalFiles} ficheiros…
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2563EB] transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {!isUploading && statusMessage && (
          <div className="mt-4 pt-3 border-t border-zinc-200 flex items-center justify-between gap-3 text-sm text-[#15803D]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              aria-label="Fechar mensagem"
              className="text-[#52525B] hover:text-[#18181B] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!isUploading && errorMessage && (
          <div
            role="alert"
            className="mt-4 pt-3 border-t border-zinc-200 flex items-center justify-between gap-3 text-sm text-[#DC2626]"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Fechar erro"
              className="text-[#52525B] hover:text-[#18181B] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
