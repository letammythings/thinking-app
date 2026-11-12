export class ApiError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): never {
  throw new ApiError(status, code, message, extra);
}
