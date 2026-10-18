declare module "dynalite" {
  import type { Server } from "node:http";

  interface DynaliteOptions {
    createTableMs?: number;
  }

  function dynalite(options?: DynaliteOptions): Server;
  export default dynalite;
}
