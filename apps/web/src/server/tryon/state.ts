export type JobStatus = "CREATED" | "VALIDATING" | "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "EXPIRED";

/**
 * Generic job lifecycle (SPEC §14). Prune states the real provider never uses once its contract is known
 * (for example drop QUEUED/PROCESSING if the API is synchronous).
 */
export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  CREATED: ["VALIDATING", "FAILED", "CANCELLED", "EXPIRED"],
  VALIDATING: ["QUEUED", "FAILED", "CANCELLED", "EXPIRED"],
  QUEUED: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const isTerminal = (s: JobStatus): boolean => JOB_TRANSITIONS[s].length === 0;
export const canMove = (from: JobStatus, to: JobStatus): boolean => JOB_TRANSITIONS[from].includes(to);
