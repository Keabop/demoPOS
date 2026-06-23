// src/lib/demo/types.ts
export interface PostgrestError { message: string; details?: string; code?: string; }
export interface PostgrestResult<T = any> {
  data: T | null;
  error: PostgrestError | null;
  count: number | null;
}
