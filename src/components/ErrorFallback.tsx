'use client';

export type ErrorFallbackProps = {
  onRetry: () => void;
};

export function ErrorFallback({ onRetry }: ErrorFallbackProps) {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4 p-6 lg:p-12">
      <h1 className="text-lg font-normal text-foreground">Something isn&apos;t rendering.</h1>
      <p className="text-base text-foreground">
        Reload the page and your list will be right where you left it.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-md px-4 py-2 text-base text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Reload
      </button>
    </div>
  );
}
