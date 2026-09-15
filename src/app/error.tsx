"use client";

import { PaceErrorScreen } from "@/components/pace/states/pace-error-screen";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <PaceErrorScreen error={error} retry={retry} />;
}
