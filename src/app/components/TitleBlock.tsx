export function TitleBlock() {
  return (
    <div className="border-b border-rule px-6 py-6 lg:px-8">
      <p
        className="mb-1 text-muted"
        style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.12em' }}
      >
        Document verification
      </p>
      <h1
        className="mb-1 text-ink"
        style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: '30px', fontWeight: 500, lineHeight: 1.15, letterSpacing: '-0.01em' }}
      >
        Document verification
      </h1>
      <p
        className="text-muted"
        style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '14px' }}
      >
        Upload a document to run 16 checks and get a pass/fail verdict with reasons.
      </p>
    </div>
  );
}
