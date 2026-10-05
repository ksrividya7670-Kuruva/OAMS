export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  STATE_CONFLICT: 'STATE_CONFLICT',
  APPOINTMENT_CONFLICT: 'APPOINTMENT_CONFLICT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CALENDAR_SYNC_FAILED: 'CALENDAR_SYNC_FAILED',
  TEAMS_LINK_GENERATION_FAILED: 'TEAMS_LINK_GENERATION_FAILED',
  SMS_PROVIDER_ERROR: 'SMS_PROVIDER_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode | string;
  public readonly details?: ApiErrorDetail[];

  constructor(
    statusCode: number,
    code: ErrorCode | string,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: ApiErrorDetail[]): ApiError {
    return new ApiError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message = 'Not authenticated'): ApiError {
    return new ApiError(401, ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'No permission to perform this action'): ApiError {
    return new ApiError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, ErrorCode.NOT_FOUND, message);
  }

  static versionConflict(message = 'Resource was modified concurrently'): ApiError {
    return new ApiError(409, ErrorCode.VERSION_CONFLICT, message);
  }

  static stateConflict(message: string): ApiError {
    return new ApiError(409, ErrorCode.STATE_CONFLICT, message);
  }

  static conflict(message = 'Resource conflict', code = 'CONFLICT'): ApiError {
    return new ApiError(409, code, message);
  }

  static businessRule(message: string, details?: ApiErrorDetail[]): ApiError {
    return new ApiError(422, ErrorCode.BUSINESS_RULE_VIOLATION, message, details);
  }

  static rateLimited(message = 'Too many requests'): ApiError {
    return new ApiError(429, ErrorCode.RATE_LIMITED, message);
  }

  static internal(message = 'An unexpected error occurred'): ApiError {
    return new ApiError(500, ErrorCode.INTERNAL_ERROR, message);
  }
}
