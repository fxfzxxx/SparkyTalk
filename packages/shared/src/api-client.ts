/**
 * Minimal typed client for the SparkyTalk API, shared by admin (web) and mobile.
 * Uses fetch only, so it runs in browsers, React Native and Node.
 */
import type { CreateSiteInput, Employee, SetSiteLocationInput, Site, SiteVisitEventInput } from "./schemas/domain";
import type { BlueprintExtraction, CommandInterpretation, ProposedAction } from "./schemas/ai";
import type { LocalDate } from "./dates";
import type { ScheduleEntryStatus, SiteVisitEventType, Stage } from "./enums";

export interface PlanRow {
  id: string;
  date: LocalDate;
  status: ScheduleEntryStatus;
  notes: string | null;
  employeeId: string;
  employeeName: string;
  jobId: string;
  jobTitle: string;
  stage: Stage | null;
  siteId: string;
  siteName: string;
  siteLocation: Site["location"];
  siteGeofence: Site["geofence"];
}

export interface VisitRow {
  employeeId: string;
  siteId: string;
  siteName: string;
  type: SiteVisitEventType;
  at: string;
}

export interface CommandProposal extends CommandInterpretation {
  proposalId: string;
  issues: { index: number; problem: string }[];
}

export interface BlueprintProposal extends BlueprintExtraction {
  proposalId: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}: ${JSON.stringify(body)}`);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Dev-mode auth: the employee id to act as. Replaced when real auth lands. */
  getUserId: () => string | null;
}

export function createApiClient({ baseUrl, getUserId }: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const userId = getUserId();
    if (userId) headers.set("x-dev-user-id", userId);
    if (init.body && typeof init.body === "string") headers.set("content-type", "application/json");
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
  }
  const post = <T>(path: string, data: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) });

  return {
    employees: () => request<Employee[]>("/v1/employees"),
    sites: () => request<Site[]>("/v1/sites"),
    createSite: (input: CreateSiteInput) => post<{ id: string }>("/v1/sites", input),
    setSiteLocation: (siteId: string, input: SetSiteLocationInput) =>
      request(`/v1/sites/${siteId}/location`, { method: "PUT", body: JSON.stringify(input) }),
    board: (date?: LocalDate) =>
      request<{ date: LocalDate; plan: PlanRow[]; visits: VisitRow[] }>(
        `/v1/schedule${date ? `?date=${date}` : ""}`,
      ),
    mySchedule: (date?: LocalDate) =>
      request<{ date: LocalDate; plan: PlanRow[] }>(`/v1/schedule/me${date ? `?date=${date}` : ""}`),
    recordVisit: (input: SiteVisitEventInput) => post("/v1/visits", input),
    command: (transcript: string) => post<CommandProposal>("/v1/ai/command", { transcript }),
    uploadBlueprint: (file: Blob, filename: string) => {
      const form = new FormData();
      form.append("file", file, filename);
      return request<BlueprintProposal>("/v1/ai/blueprint", { method: "POST", body: form });
    },
    confirmCommand: (proposalId: string, actions?: ProposedAction[]) =>
      post<{ applied: number }>(`/v1/ai/proposals/${proposalId}/confirm`, { actions }),
    confirmBlueprint: (proposalId: string, site: CreateSiteInput) =>
      post<{ site: { id: string } }>(`/v1/ai/proposals/${proposalId}/confirm`, { site }),
    reject: (proposalId: string) => post(`/v1/ai/proposals/${proposalId}/reject`, {}),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
