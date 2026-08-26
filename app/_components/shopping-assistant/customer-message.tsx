export function CustomerMessage({ message }: { message: string }) {
  return (
    <article className="ml-auto max-w-2xl text-right">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b857e]">
        You
      </p>
      <div className="ml-auto w-fit max-w-full rounded-2xl rounded-tr-md border border-[#1d2a24]/8 bg-white/55 px-5 py-3.5 text-left text-[15px] leading-6 shadow-sm shadow-[#1d2a24]/4">
        {message}
      </div>
    </article>
  );
}
