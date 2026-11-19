CREATE TABLE "plan_prices" (
	"plan" text PRIMARY KEY NOT NULL,
	"price" integer NOT NULL,
	"setup_fee" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
