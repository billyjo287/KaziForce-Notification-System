/**
 * An error the API sends back on purpose, with a stable `code` the website turns into a plain
 * English or Kiswahili sentence (see frontend/src/i18n, "errors.api").
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const unauthorized = (code = 'not_logged_in', message = 'Please log in.') =>
  new HttpError(401, code, message);
export const forbidden = (code = 'not_allowed', message = 'You are not allowed to do this.') =>
  new HttpError(403, code, message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
