"use client";

import dynamic from "next/dynamic";

export const SettingsFormLoader = dynamic(
  () =>
    import("@/components/settings-form").then((mod) => mod.SettingsForm),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-zinc-500" aria-live="polite">
        Loading settings…
      </p>
    ),
  },
);
