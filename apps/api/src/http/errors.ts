export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
