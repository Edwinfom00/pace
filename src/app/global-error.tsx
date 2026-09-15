"use client";

import { PaceErrorScreen } from "@/components/pace/states/pace-error-screen";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <PaceErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
