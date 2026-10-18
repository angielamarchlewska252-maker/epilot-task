const SCALE = 8;

export class InvalidPriceError extends Error {
  constructor(value: string) {
    super(`Invalid price: ${value}`);
    this.name = "InvalidPriceError";
  }
}

/**
 * Parse a decimal string into an integer with 8 decimal places.
 * "70000.1" and "70000.10000000" compare equal. Binary floats are never used.
 */
export function parsePrice(value: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)) {
    throw new InvalidPriceError(String(value));
  }

  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole + fraction.padEnd(SCALE, "0"));
  if (scaled <= 0n) {
    throw new InvalidPriceError(value);
  }
  return scaled;
}

export function comparePrices(left: string, right: string): -1 | 0 | 1 {
  const a = parsePrice(left);
  const b = parsePrice(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
