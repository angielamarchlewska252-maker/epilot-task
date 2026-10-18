import { useEffect, useState } from "react";

/**
 * Visual countdown only. The offset comes from the server clock, and the
 * backend still decides when a guess may resolve.
 */
export function useCountdown(eligibleAt: string | null, serverTime: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!serverTime) return;
    setOffset(Date.parse(serverTime) - Date.now());
  }, [serverTime]);

  useEffect(() => {
    if (!eligibleAt || import.meta.env.MODE === "test") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [eligibleAt]);

  if (!eligibleAt) return null;
  return Date.parse(eligibleAt) - (now + offset);
}
