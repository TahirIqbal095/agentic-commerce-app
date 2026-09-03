/**
 * Renders one Customer-side Transcript record.
 *
 * A Customer Action Entry shares this presentation because the Customer
 * initiated it, and states its generated provenance so it is never read as text
 * the Customer typed.
 */
export function CustomerMessage({
  message,
  provenanceNote,
}: {
  message: string;
  provenanceNote?: string;
}) {
  return (
    <article className="ml-auto max-w-2xl text-right">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        You
      </p>
      <div className="ml-auto w-fit max-w-full rounded-md border-2 border-sidebar-border bg-card px-5 py-3.5 text-left text-[15px] leading-6 text-card-foreground shadow-hard-sm">
        {message}
      </div>
      {provenanceNote ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {provenanceNote}
        </p>
      ) : null}
    </article>
  );
}
