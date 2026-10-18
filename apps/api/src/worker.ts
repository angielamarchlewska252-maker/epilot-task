import { buildRuntime } from "./composition.js";

const { service } = buildRuntime();

export const handler = async () => {
  const settled = await service.settleDue(25);
  return { settled };
};
