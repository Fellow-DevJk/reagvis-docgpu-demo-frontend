import { FileText, FileImage, X } from 'lucide-react';

interface FileChipProps {
  file: File;
  onRemove?: () => void;
  disabled?: boolean;
}

export function FileChip({ file, onRemove, disabled }: FileChipProps) {
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  const ext    = file.name.split('.').pop()?.toUpperCase() ?? '';
  const isImg  = file.type.startsWith('image/');

  return (
    <div
      className="flex items-center gap-2 border border-rule bg-paper-sunk px-3 py-2"
      style={{ borderRadius: '4px' }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-rule bg-paper" style={{ borderRadius: '3px' }}>
        {isImg
          ? <FileImage className="h-4 w-4 text-muted" strokeWidth={1.5} />
          : <FileText  className="h-4 w-4 text-muted" strokeWidth={1.5} />}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-ink"
          title={file.name}
          style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '12px', fontWeight: 500 }}
        >
          {file.name}
        </p>
        <p
          className="text-muted"
          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px' }}
        >
          {sizeMB} MB · {ext}
        </p>
      </div>
      {onRemove && !disabled && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1 text-muted transition-colors hover:text-ink"
          title="Remove file"
          style={{ borderRadius: '2px' }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
