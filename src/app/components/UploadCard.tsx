import { useRef, useState, DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { FileChip } from './FileChip';
import { ValidationPhase } from '../hooks/useValidation';
import clsx from 'clsx';

interface UploadCardProps {
  phase: ValidationPhase;
  file: File | null;
  onFile: (f: File | null) => void;
  onRun: () => void;
}

export function UploadCard({ phase, file, onFile, onRun }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const canDrop    = phase !== 'analyzing';
  const runEnabled = !!file && phase !== 'analyzing';
  const analyzing  = phase === 'analyzing';

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFile(files[0]);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!canDrop) return;
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={canDrop ? 0 : -1}
        aria-label="Upload document"
        onClick={() => canDrop && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && canDrop && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); canDrop && setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={clsx(
          'flex h-[140px] w-full flex-col items-center justify-center border transition-colors',
          canDrop
            ? dragOver
              ? 'cursor-copy border-orange bg-orange/5'
              : 'cursor-pointer border-dashed border-rule hover:border-orange hover:bg-paper-sunk'
            : 'cursor-default border-dashed border-rule/50 opacity-50'
        )}
        style={{ borderRadius: '6px' }}
      >
        <UploadCloud
          className={clsx('mb-2 h-6 w-6', dragOver ? 'text-orange' : 'text-muted')}
          strokeWidth={1.5}
        />
        <p
          className="text-muted"
          style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px', fontWeight: 500 }}
        >
          {dragOver ? 'Drop to upload' : 'Drag & drop or click to browse'}
        </p>
        <p
          className="mt-0.5 text-muted"
          style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '12px' }}
        >
          PDF, JPG, PNG · max 10 files
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={e => handleFiles(e.target.files)}
          tabIndex={-1}
        />
      </div>

      {/* File chip */}
      {file && (
        <FileChip
          file={file}
          onRemove={analyzing || phase === 'results' ? undefined : () => onFile(null)}
          disabled={analyzing}
        />
      )}

      {/* Run verification button */}
      <button
        onClick={onRun}
        disabled={!runEnabled}
        style={{
          height: '44px',
          width: '100%',
          borderRadius: '6px',
          fontFamily: 'IBM Plex Sans, sans-serif',
          fontSize: '14px',
          fontWeight: 600,
          letterSpacing: '0.01em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'background 0.15s, box-shadow 0.15s',
          cursor: runEnabled ? 'pointer' : 'not-allowed',
          ...(runEnabled
            ? {
                background: '#D2541B',
                color: '#F5F3EE',
                border: '1px solid #B84418',
                boxShadow: '0 6px 18px rgba(210,84,27,.28)',
              }
            : {
                background: '#ECE7DD',
                color: '#6E655A',
                border: '1px solid #D8D1C4',
                boxShadow: 'none',
              }),
        }}
        onMouseEnter={e => { if (runEnabled) (e.currentTarget as HTMLButtonElement).style.background = '#B84418'; }}
        onMouseLeave={e => { if (runEnabled) (e.currentTarget as HTMLButtonElement).style.background = '#D2541B'; }}
      >
        {analyzing ? (
          <>
            <span
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Analyzing…
          </>
        ) : (
          'Run verification'
        )}
      </button>
    </div>
  );
}
