import { handle } from "hono/aws-lambda";
import { buildRuntime } from "./composition.js";

const { app } = buildRuntime();

export const handler = handle(app);
