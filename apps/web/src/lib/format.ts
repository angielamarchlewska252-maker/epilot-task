const SCALE = 8;

function scale(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt((whole ?? "0") + fraction.padEnd(SCALE, "0").slice(0, SCALE));
}

export function formatUsd(price: string): string {
  const [whole = "0", fraction = ""] = price.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${withCommas}.${(fraction + "00").slice(0, 2)}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function priceMoved(entry: string, settlement: string): "up" | "down" | "unchanged" {
  const left = scale(entry);
  const right = scale(settlement);
  if (left === right) return "unchanged";
  return right > left ? "up" : "down";
}
