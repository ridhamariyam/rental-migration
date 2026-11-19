import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  subscriptionPaymentPurposeEnum,
  subscriptionPaymentStatusEnum,
  subscriptionPlanEnum,
} from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";

/** Business + owner details captured on the public signup form, held on
 * the payment row until the payment succeeds and the account is created. */
export type SignupDetails = {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  address?: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone?: string;
};

/**
 * Every payment a business makes to the platform owner (Razorpay). A
 * signup row exists *before* there is a shop — it carries the details the
 * shop and its owner are created from once the gateway confirms payment —
 * so `shopId` is null until then. A renewal row always has a shop.
 *
 * Money is integer paise, the gateway's own unit, so the stored amount is
 * byte-for-byte what was charged.
 */
export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id").references(() => shops.id, {
      onDelete: "set null",
    }),
    purpose: subscriptionPaymentPurposeEnum("purpose").notNull(),
    plan: subscriptionPlanEnum("plan").notNull(),
    status: subscriptionPaymentStatusEnum("status")
      .notNull()
      .default("created"),
    planFeePaise: integer("plan_fee_paise").notNull(),
    setupFeePaise: integer("setup_fee_paise").notNull().default(0),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id").unique(),
    signupDetails: jsonb("signup_details").$type<SignupDetails>(),
    //: bcrypt hash of the password the owner chose at signup. Cleared the
    //: moment the account is provisioned — it then lives on `users` only.
    ownerPasswordHash: text("owner_password_hash"),
    //: Paid, but the account could not be created automatically (e.g. the
    //: business email was taken between checkout and payment). Surfaced on
    //: the admin dashboard so the platform owner can sort it out by hand.
    needsAttention: boolean("needs_attention").notNull().default(false),
    note: text("note"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_subscription_payments_shop").on(table.shopId),
    index("idx_subscription_payments_status_created").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;
