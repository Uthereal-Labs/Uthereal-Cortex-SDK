/** Generated wire types. Answer in contract.ts is the accumulated, normalized helper state. */
import type { components } from "./openapi.generated.ts";

export type ApiAskRequest = components["schemas"]["AskRequest"];
export type ApiAskInput = Omit<ApiAskRequest, "id_user">;
export type ApiAskEvent = components["schemas"]["AskStreamEvent"];
export type ApiActivityEvent = components["schemas"]["ActivityEvent"];
export type ApiStreamEvent = ApiAskEvent | ApiStatusEvent | ApiActivityEvent;
export type ApiStatusEvent = components["schemas"]["StatusEvent"];
export type ApiRagRequest = components["schemas"]["RagRequest"];
export type ApiRagInput = Omit<ApiRagRequest, "id_user">;
export type ApiRagResponse = components["schemas"]["RagResponse"];
export type ApiClaim = components["schemas"]["UIClaim"];
export type ApiReferences = components["schemas"]["UIReferences"];
export type ApiPdfRefreshRequest = components["schemas"]["PdfRefreshRequest"];
export type ApiPdfRefreshResponse = components["schemas"]["PdfRefreshResponse"];
