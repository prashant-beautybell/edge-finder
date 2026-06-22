export const DEFAULT_JK_THRESHOLD = Number(process.env.DEFAULT_JK_THRESHOLD ?? 0);
export const DEFAULT_STAKE = Number(process.env.DEFAULT_STAKE ?? 1000);
export const SP_CAP = Number(process.env.SP_CAP ?? 2.5);
export const MIN_WEIGHT_LBS = Number(process.env.MIN_WEIGHT_LBS ?? 122);
export const MIN_FIELD_SIZE = Number(process.env.MIN_FIELD_SIZE ?? 6);
export const MAX_FIELD_SIZE = Number(process.env.MAX_FIELD_SIZE ?? 12);
export const TARGET_DISTANCES = (process.env.TARGET_DISTANCES ?? "6f,7f,1m")
  .split(",")
  .map((d) => d.trim());
