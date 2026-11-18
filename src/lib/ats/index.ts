import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartrecruiters } from "./smartrecruiters";
import type { AtsAdapter, AtsName } from "./types";
import { workable } from "./workable";

export const adapters: Record<AtsName, AtsAdapter> = { greenhouse, lever, ashby, workable, smartrecruiters };

export function getAdapter(name: string): AtsAdapter {
  const a = adapters[name as AtsName];
  if (!a) throw new Error(`Unknown ATS: ${name}`);
  return a;
}

export type { AtsAdapter, AtsName, NormalizedJob } from "./types";
