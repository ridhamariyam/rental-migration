import "server-only";

import { env } from "@/lib/env";

type UnknownRecord = Record<string, unknown>;

export type Msg91Number = {
  integratedNumber: string;
  displayName: string | null;
  wabaId: string | null;
  metaBusinessId: string | null;
  status: string;
  raw: UnknownRecord;
};

export type Msg91Template = {
  name: string;
  namespace: string | null;
  language: string;
  category: string | null;
  status: string;
  body: string | null;
  components: UnknownRecord;
  variableSlots: string[];
  /**
   * Maps a NAMED-parameter template's `parameter_name` (e.g. "var_1") to
   * its correct MSG91 component key (e.g. "body_var_1") — lets callers
   * translate rule mappings saved under the old, buggy
   * `extractVariableSlots` key without a manual re-save. Empty for
   * POSITIONAL templates, which never had a wrong key.
   */
  legacySlotAliases: Record<string, string>;
  raw: UnknownRecord;
};

export type Msg91SendResult = {
  providerMessageId: string | null;
  providerRequestId: string | null;
  raw: UnknownRecord;
};

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickArray(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) return payload.map(asRecord);
  const record = asRecord(payload);
  for (const key of ["data", "numbers", "result", "templates"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.map(asRecord);
  }
  if (Array.isArray(asRecord(record.data).data)) {
    return (asRecord(record.data).data as unknown[]).map(asRecord);
  }
  return [];
}

function extractTemplateBody(record: UnknownRecord): string | null {
  const direct = stringValue(record.body) ?? stringValue(record.template_body);
  if (direct) return direct;

  const components = Array.isArray(record.components)
    ? record.components
    : Array.isArray(record.code)
      ? record.code
      : [];
  const body = components
    .map(asRecord)
    .find((component) => stringValue(component.type)?.toLowerCase() === "body");

  return stringValue(body?.text) ?? stringValue(body?.body);
}

function extractVariableSlots(body: string | null, components: UnknownRecord): string[] {
  const slots = new Set<string>();
  const source = `${body ?? ""} ${JSON.stringify(components)}`;
  for (const match of source.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)) {
    slots.add(/^\d+$/.test(match[1]) ? `body_${match[1]}` : match[1]);
  }
  return [...slots];
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : null;
}

/**
 * MSG91's own template payload already lists the exact component keys to
 * send (`variables`, e.g. `["body_var_1", ...]` for NAMED-parameter
 * templates vs `["body_1", ...]` for POSITIONAL ones). Prefer that over
 * `extractVariableSlots`'s regex guess, which reconstructs `{{var_1}}` as
 * bare `"var_1"` instead of MSG91's expected `"body_var_1"` key —  a
 * mismatch that makes MSG91 reject the send with "Parameter name is
 * missing or empty" for every NAMED-parameter template. Checks both the
 * flat shape and the `languages[]`-nested shape (see `template/*.json`).
 */
function extractDeclaredVariables(record: UnknownRecord): string[] | null {
  const direct = stringArray(record.variables);
  if (direct) return direct;

  const languages = Array.isArray(record.languages) ? record.languages.map(asRecord) : [];
  for (const language of languages) {
    const nested = stringArray(language.variables);
    if (nested) return nested;
  }

  return null;
}

/**
 * Reverse-maps every way a rule's `variableMapping` could have ended up
 * keyed wrong for a NAMED-parameter template, onto the correct MSG91
 * component key:
 *  - `parameter_name` (e.g. "var_1") from `variable_type`, for slots
 *    derived by the old regex-based `extractVariableSlots`.
 *  - Generic positional `body_N` (e.g. "body_1"), because the rules in
 *    this app were actually hand-configured with that convention
 *    regardless of template type — the true bug this whole fix targets.
 */
function extractLegacySlotAliases(
  record: UnknownRecord,
  declaredVariables: string[] | null,
): Record<string, string> {
  const aliases: Record<string, string> = {};

  const addFrom = (variableType: unknown) => {
    for (const [key, meta] of Object.entries(asRecord(variableType))) {
      const parameterName = stringValue(asRecord(meta).parameter_name);
      if (parameterName && parameterName !== key) aliases[parameterName] = key;
    }
  };

  addFrom(record.variable_type);
  const languages = Array.isArray(record.languages) ? record.languages.map(asRecord) : [];
  for (const language of languages) addFrom(language.variable_type);

  declaredVariables?.forEach((variable, index) => {
    const positional = `body_${index + 1}`;
    if (positional !== variable) aliases[positional] = variable;
  });

  return aliases;
}

export class Msg91Client {
  private readonly baseUrl: string;
  private readonly authkey: string;

  constructor() {
    this.baseUrl = env.MSG91_WHATSAPP_BASE_URL.replace(/\/$/, "");
    this.authkey = env.MSG91_AUTHKEY;
  }

  private async request(path: string, init: RequestInit = {}): Promise<UnknownRecord> {
    if (!this.authkey || this.authkey === "change-me") {
      throw new Error("MSG91_AUTHKEY is not configured");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authkey: this.authkey,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as UnknownRecord;
    if (!response.ok) {
      const message =
        stringValue(payload.message) ??
        stringValue(payload.error) ??
        `MSG91 request failed with status ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async fetchNumbers(): Promise<Msg91Number[]> {
    const payload = await this.request("/whatsapp-activation/");

    return pickArray(payload)
      .map((record) => {
        const integratedNumber =
          stringValue(record.integrated_number) ??
          stringValue(record.integratedNumber) ??
          stringValue(record.number) ??
          stringValue(record.phone_number);

        if (!integratedNumber) return null;

        return {
          integratedNumber,
          displayName:
            stringValue(record.display_name) ??
            stringValue(record.displayName) ??
            stringValue(record.name),
          wabaId: stringValue(record.waba_id) ?? stringValue(record.wabaId),
          metaBusinessId:
            stringValue(record.meta_business_id) ??
            stringValue(record.business_id) ??
            stringValue(record.metaBusinessId),
          status:
            stringValue(record.status) ??
            stringValue(record.number_status) ??
            "unknown",
          raw: record,
        };
      })
      .filter((number): number is Msg91Number => Boolean(number));
  }

  async fetchTemplates(integratedNumber: string): Promise<Msg91Template[]> {
    // Every status, not only approved. Editing a template sends it back to
    // Meta review, and while it is "pending" MSG91 still accepts the send
    // request — Meta then fails it asynchronously with "template name ...
    // does not exist in en". With an approved-only filter such a template
    // simply dropped out of the response, so its stored row stayed
    // "approved" and every booking confirmation went to a dead template.
    const params = new URLSearchParams({
      pagination: "true",
      page_size: "500",
      page_num: "1",
    });
    const payload = await this.request(
      `/get-template-client/${encodeURIComponent(integratedNumber)}?${params}`,
      { headers: { "content-type": "text/plain" } },
    );

    return pickArray(payload).flatMap((template) => {
      const name =
        stringValue(template.name) ??
        stringValue(template.template_name) ??
        stringValue(template.templateName);
      if (!name) return [];

      // MSG91 keeps status, variables and body per language under
      // `languages[]`, and each language is approved separately — so each
      // is its own row. Reading them off the top level instead found no
      // status and fell back to "approved" for every template.
      const languages = Array.isArray(template.languages)
        ? template.languages.map(asRecord)
        : [];
      const variants: UnknownRecord[] =
        languages.length > 0
          ? languages.map((language) => ({ ...template, ...language, languages: [] }))
          : [template];

      return variants.map((record): Msg91Template => {
        const componentsValue = record.components ?? record.template_components ?? {};
        const components = Array.isArray(componentsValue)
          ? { items: componentsValue }
          : asRecord(componentsValue);
        const body = extractTemplateBody(record);
        const variableSlots = extractDeclaredVariables(record) ?? extractVariableSlots(body, components);

        return {
          name,
          namespace:
            stringValue(record.namespace) ?? stringValue(record.template_namespace),
          language:
            stringValue(record.language) ??
            stringValue(record.template_language) ??
            "en",
          category: stringValue(record.category) ?? stringValue(record.template_category),
          status: stringValue(record.status) ?? "unknown",
          body,
          components,
          variableSlots,
          legacySlotAliases: extractLegacySlotAliases(record, variableSlots),
          raw: template,
        };
      });
    });
  }

  async sendTemplate(params: {
    integratedNumber: string;
    to: string;
    templateName: string;
    templateNamespace: string | null;
    language: string;
    components: UnknownRecord;
    crqid: string;
  }): Promise<Msg91SendResult> {
    const payload = {
      integrated_number: params.integratedNumber,
      content_type: "template",
      CRQID: params.crqid,
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: params.templateName,
          language: { code: params.language, policy: "deterministic" },
          ...(params.templateNamespace ? { namespace: params.templateNamespace } : {}),
          to_and_components: [
            {
              to: [params.to],
              components: params.components,
              CRQID: params.crqid,
            },
          ],
        },
      },
    };

    const raw = await this.request("/whatsapp-outbound-message/bulk/", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      providerMessageId:
        stringValue(raw.message_uuid) ??
        stringValue(raw.message_id) ??
        stringValue(raw.id),
      providerRequestId:
        stringValue(raw.request_id) ??
        stringValue(raw.requestId) ??
        stringValue(raw.campaign_request_id),
      raw,
    };
  }
}
