import { z } from "zod";
import type { ApiPdfRefreshRequest } from "./api-types.ts";
import {
  type Answer,
  askSchema,
  type InlineReference,
  ragResponseSchema,
  ragSchema,
} from "./contract.ts";
import { CortexError, responseError } from "./errors.ts";

export type CortexConfig = {
  baseUrl: string;
  assistantId: string;
  apiKey: string;
};

export class CortexClient {
  private base: URL;
  constructor(
    private config: CortexConfig,
    private fetcher: typeof fetch = fetch,
  ) {
    this.base = new URL(config.baseUrl);
    if (
      this.base.username || this.base.password || this.base.search ||
      this.base.hash ||
      !/^\/.*functions\/v1\/api-server-proxy(?:-staging)?$/.test(
        this.base.pathname,
      ) ||
      (this.base.protocol !== "https:" &&
        !(this.base.protocol === "http:" &&
          ["localhost", "127.0.0.1", "host.docker.internal"].includes(
            this.base.hostname,
          )))
    ) {
      throw new Error(
        "Configure the fixed Cortex Edge proxy base URL without query or trailing slash",
      );
    }
  }
  private request(
    path: string,
    userId: string,
    body?: unknown,
    signal?: AbortSignal,
  ) {
    return this.fetcher(this.base.href + path, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "X-App-Code": "selfserve",
        "X-External-User-Id": userId,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
    });
  }
  private async parseResponse<T>(
    response: Response,
    schema: z.ZodType<T>,
  ): Promise<T> {
    try {
      return schema.parse(await response.json());
    } catch (error) {
      if (!(error instanceof SyntaxError || error instanceof z.ZodError)) {
        throw error;
      }
      throw new CortexError(
        502,
        "INVALID_UPSTREAM_RESPONSE",
        response.headers.get("x-request-id"),
      );
    }
  }
  ask(
    userId: string,
    sessionId: string,
    input: z.input<typeof askSchema>,
    signal?: AbortSignal,
  ) {
    return this.request(
      `/external/v1/assistants/${
        encodeURIComponent(this.config.assistantId)
      }/sessions/${encodeURIComponent(sessionId)}/ask`,
      userId,
      { ...askSchema.parse(input), id_user: userId },
      signal,
    );
  }
  async rag(
    userId: string,
    input: z.input<typeof ragSchema>,
    signal?: AbortSignal,
  ) {
    const response = await this.request(
      `/external/v1/assistants/${
        encodeURIComponent(this.config.assistantId)
      }/rag`,
      userId,
      { ...ragSchema.parse(input), id_user: userId },
      signal,
    );
    if (!response.ok) throw await responseError(response);
    return this.parseResponse(response, ragResponseSchema);
  }
  /** Caller must load answer from an ownership-checked record, never accept it from the browser. */
  async pdf(
    userId: string,
    sessionId: string,
    answer: Answer,
    inlineId: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const pdfSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000);
    const inline: InlineReference | undefined = answer.references.inline.find((
      item,
    ) => item.id === inlineId);
    if (
      inline?.type !== "pdf_highlight" || inline.page == null ||
      !inline.id_datasource
    ) throw new CortexError(404, "PDF_UNAVAILABLE");
    const source = answer.references.datasources.find((item) =>
      item.id === inline.id_datasource
    );
    const getPdf = (path: string) => {
      // Validate before joining with trusted base; disallow redirects, alternate origins and path escapes.
      if (
        !/^\/chat\/reference\/pdf\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\?page=\d+)?$/
          .test(path)
      ) {
        throw new CortexError(502, "INVALID_REFERENCE_PATH");
      }
      const url = new URL(this.base.href + path);
      url.searchParams.set("page", String(inline.page));
      return this.request(
        url.href.slice(this.base.href.length),
        userId,
        undefined,
        pdfSignal,
      );
    };
    let response: Response | undefined;
    const path = source?.secure_url ?? source?.url;
    if (path) {
      response = await getPdf(path);
      if (!response.ok) {
        const error = await responseError(response);
        if (error.code !== "REFERENCE_TOKEN_INVALID_OR_EXPIRED") throw error;
        response = undefined;
      }
    }
    if (!response) {
      const refresh = await this.request(
        "/chat/reference/pdf/refresh",
        userId,
        {
          id_assistant: this.config.assistantId,
          id_session: sessionId,
          id_datasource: inline.id_datasource,
          page: inline.page,
          interaction_id: answer.interaction_id,
          inline_reference_id: inline.id,
        } satisfies ApiPdfRefreshRequest,
        pdfSignal,
      );
      if (!refresh.ok) throw await responseError(refresh);
      const refreshed = await this.parseResponse(
        refresh,
        z.object({
          secure_url: z.string().nullish(),
          url: z.string().nullish(),
        }),
      );
      response = await getPdf(refreshed.secure_url ?? refreshed.url ?? "");
    }
    if (!response.ok) throw await responseError(response);
    if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
      throw new CortexError(502, "INVALID_PDF_RESPONSE");
    }
    return response;
  }
}
