/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import { LicenseStatus } from "@cocalc/util/upgrades/quota";

export type { DatastoreConfig } from "@cocalc/util/types";

type UserRecord = TypedMap<{
  group: string;
  upgrades: { network: number };
  hide: boolean;
}>;

export type ProjectStatus = TypedMap<{
  cpu: { usage: number };
  memory: { rss: number };
  disk_MB: number;
  start_ts: number;
}>;

export type ProjectSettings = Map<string, any>;

// this is the "correct" type you get, when doing e.g. project.get('site_license')
export type SiteLicense = Map<
  string,
  TypedMap<{
    quota?: TypedMap<SiteLicenseQuota>;
    status?: LicenseStatus;
  }>
>;

export type Project = TypedMap<{
  title: string;
  description: string;
  name?: string;
  project_id: string;
  deleted?: boolean;
  hidden?: boolean;
  users: Map<string, UserRecord>;
  state?: { state: "opened" | "running" | "starting" | "stopping" };
  status: ProjectStatus;
  settings: ProjectSettings;
  compute_image: string;
  site_license?: SiteLicense;
}>;
