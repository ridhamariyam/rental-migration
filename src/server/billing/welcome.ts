import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";

import type { SignupDetails } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { normalizeWhatsAppPhone } from "@/lib/notifications";
import { Msg91Client } from "@/server/notifications/msg91";

/**
 * The platform owner's WhatsApp welcome to a business that has just bought
 * the software. Sent from the platform's own MSG91 number
 * (`PLATFORM_WHATSAPP_NUMBER`) — unrelated to the per-shop notification
 * rules, which message a tenant's *customers* from the tenant's number.
 *
 * The MSG91 template (`PLATFORM_WELCOME_TEMPLATE`) must take exactly these
 * six named body variables, in this order:
 *
 *   {{var_1}} owner's first name     {{var_4}} active until
 *   {{var_2}} business name          {{var_5}} login email
 *   {{var_3}} plan name              {{var_6}} login link
 */
export type WelcomeInput = {
  details: SignupDetails;
  planName: string;
  periodEnd: Date;
};

export function isWelcomeConfigured(): boolean {
  return Boolean(env.PLATFORM_WHATSAPP_NUMBER && env.PLATFORM_WELCOME_TEMPLATE);
}

export function buildWelcomeComponents(
  input: WelcomeInput,
  appUrl = env.NEXT_PUBLIC_APP_URL,
): Record<string, { type: "text"; value: string }> {
  const values = [
    input.details.ownerFirstName,
    input.details.businessName,
    input.planName,
    formatDate(input.periodEnd, "long"),
    input.details.ownerEmail,
    `${appUrl.replace(/\/$/, "")}/login`,
  ];

  return Object.fromEntries(
    values.map((value, index) => [
      `body_var_${index + 1}`,
      // Meta rejects a template parameter that is empty or contains a
      // line break, so neither is ever sent.
      { type: "text" as const, value: value.replace(/\s+/g, " ").trim() || "—" },
    ]),
  );
}

/** The owner's own phone if they gave one, else the business phone. */
export function welcomeRecipient(details: SignupDetails): string {
  return normalizeWhatsAppPhone(
    details.ownerPhone?.trim() || details.businessPhone,
    env.WHATSAPP_DEFAULT_COUNTRY_CODE,
  );
}

export async function sendWelcomeMessage(input: WelcomeInput): Promise<void> {
  const result = await new Msg91Client().sendTemplate({
    integratedNumber: env.PLATFORM_WHATSAPP_NUMBER,
    to: welcomeRecipient(input.details),
    templateName: env.PLATFORM_WELCOME_TEMPLATE,
    templateNamespace: env.PLATFORM_WELCOME_TEMPLATE_NAMESPACE || null,
    language: env.PLATFORM_WELCOME_TEMPLATE_LANGUAGE,
    components: buildWelcomeComponents(input),
    crqid: randomUUID(),
  });

  console.info(
    `[billing] welcome sent to "${input.details.businessName}"` +
      (result.providerRequestId ? ` (request ${result.providerRequestId})` : ""),
  );
}

/**
 * Sends the welcome once the response is out: the account is committed by
 * then, MSG91's latency stays off the checkout/webhook request, and a send
 * failure can never undo a payment that has already been taken.
 */
export function sendWelcomeAfterResponse(input: WelcomeInput): void {
  if (!isWelcomeConfigured()) return;

  after(async () => {
    try {
      await sendWelcomeMessage(input);
    } catch (error) {
      console.error(
        `[billing] welcome to "${input.details.businessName}" failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  });
}
