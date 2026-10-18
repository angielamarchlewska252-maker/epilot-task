import { z } from "zod";

export const directionSchema = z.enum(["UP", "DOWN"]);
export type Direction = z.infer<typeof directionSchema>;

export const guessResultSchema = z.enum(["CORRECT", "INCORRECT"]);
export type GuessResult = z.infer<typeof guessResultSchema>;

/** Positive decimal with at most 8 fractional digits. Compared as integers, never as floats. */
export const decimalPriceSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/);

export const activeGuessSchema = z.object({
  guessId: z.string().min(1),
  direction: directionSchema,
  entryPrice: decimalPriceSchema,
  createdAt: z.string().datetime(),
  eligibleAt: z.string().datetime(),
  status: z.literal("PENDING"),
});
export type ActiveGuess = z.infer<typeof activeGuessSchema>;

export const resolvedGuessSchema = z.object({
  guessId: z.string().min(1),
  direction: directionSchema,
  entryPrice: decimalPriceSchema,
  settlementPrice: decimalPriceSchema,
  createdAt: z.string().datetime(),
  eligibleAt: z.string().datetime(),
  resolvedAt: z.string().datetime(),
  result: guessResultSchema,
  scoreDelta: z.union([z.literal(1), z.literal(-1)]),
});
export type ResolvedGuess = z.infer<typeof resolvedGuessSchema>;

export const playerStateSchema = z.object({
  score: z.number().int(),
  activeGuess: activeGuessSchema.nullable(),
  recentGuesses: z.array(resolvedGuessSchema),
  serverTime: z.string().datetime(),
});
export type PlayerState = z.infer<typeof playerStateSchema>;

export const createPlayerResponseSchema = z.object({
  token: z.string().min(1),
  player: playerStateSchema,
});
export type CreatePlayerResponse = z.infer<typeof createPlayerResponseSchema>;

export const priceResponseSchema = z.object({
  price: decimalPriceSchema,
  source: z.string().min(1),
  observedAt: z.string().datetime(),
  fresh: z.boolean(),
  serverTime: z.string().datetime(),
});
export type PriceResponse = z.infer<typeof priceResponseSchema>;

export const submitGuessRequestSchema = z
  .object({
    direction: directionSchema,
  })
  .strict();
export type SubmitGuessRequest = z.infer<typeof submitGuessRequestSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  serverTime: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const devQuoteRequestSchema = z
  .object({
    price: decimalPriceSchema,
  })
  .strict();
