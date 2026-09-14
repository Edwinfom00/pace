import type { DashboardLabels } from "@/i18n/dashboard-messages";
import type { WorkspaceType } from "@/modules/workspaces/domain";

export type SidebarWorkspace = {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
};

export type SidebarUser = {
  name: string;
  email: string;
};

export type PaceSidebarLabels = DashboardLabels;
