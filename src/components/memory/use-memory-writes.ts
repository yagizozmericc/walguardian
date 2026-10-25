"use client";

import { useIntegrationStatus } from "@/components/layout/use-integration-status";

/**
 * What this deployment lets users save. Until known, free-text inputs stay
 * hidden (the conservative default); the server enforces the policy anyway.
 */
export function useMemoryWrites() {
  const { data } = useIntegrationStatus();
  const w = data?.memoryWrites ?? null;
  return {
    known: w !== null,
    enabled: w?.enabled ?? true,
    allowNotes: w !== null && !w.structuredOnly,
    detail: w?.detail ?? null,
  };
}
