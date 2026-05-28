export type ApiResponse<T> = {
  data: T;
  requestId: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export type DuplicateDecision = 'replace' | 'keep_both' | 'skip';
