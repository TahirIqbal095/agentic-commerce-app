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
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b857e]">
        You
      </p>
      <div className="ml-auto w-fit max-w-full rounded-2xl rounded-tr-md border border-[#1d2a24]/8 bg-white/55 px-5 py-3.5 text-left text-[15px] leading-6 shadow-sm shadow-[#1d2a24]/4">
        {message}
      </div>
      {provenanceNote ? (
        <p className="mt-2 text-[11px] text-[#7b857e]">{provenanceNote}</p>
      ) : null}
    </article>
  );
}
