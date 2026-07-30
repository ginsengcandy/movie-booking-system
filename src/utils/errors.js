export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new AppError(400, 'BAD_REQUEST', message);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);
export const notFound = (message) => new AppError(404, 'NOT_FOUND', message);
