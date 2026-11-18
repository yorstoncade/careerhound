import { careersPage } from "../careers/careersPage";
import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartrecruiters } from "./smartrecruiters";
import type { AtsAdapter, AtsName } from "./types";
import { workable } from "./workable";
import { workday } from "./workday";

export const platformAdapters = { greenhouse, lever, ashby, workable, smartrecruiters, workday };

export const adapters: Record<AtsName, AtsAdapter> = { ...platformAdapters, "careers-page": careersPage };

export function getAdapter(name: string): AtsAdapter {
  const a = adapters[name as AtsName];
  if (!a) throw new Error(`Unknown ATS: ${name}`);
  return a;
}

export const PLATFORM_LABELS: Record<AtsName, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
  "careers-page": "careers page",
};

export type { AtsAdapter, AtsName, NormalizedJob, PlatformName, ScrapeContext, ScrapeOutcome } from "./types";
