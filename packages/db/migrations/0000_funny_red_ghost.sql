CREATE TABLE "airport_constraints" (
	"id" serial PRIMARY KEY NOT NULL,
	"airport" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"source_url" text NOT NULL,
	"as_of" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airport_delays_monthly" (
	"airport" text NOT NULL,
	"carrier" text NOT NULL,
	"month" date NOT NULL,
	"arr_flights" double precision,
	"arr_del15" double precision,
	"arr_cancelled" double precision,
	"arr_diverted" double precision,
	"carrier_delay" double precision,
	"weather_delay" double precision,
	"nas_delay" double precision,
	"security_delay" double precision,
	"late_aircraft_delay" double precision,
	"import_id" integer,
	CONSTRAINT "airport_delays_monthly_airport_carrier_month_pk" PRIMARY KEY("airport","carrier","month")
);
--> statement-breakpoint
CREATE TABLE "airport_traffic_monthly" (
	"airport" text NOT NULL,
	"month" date NOT NULL,
	"departures" integer,
	"passengers" integer,
	"seats" integer,
	"dom_departures" integer,
	"dom_passengers" integer,
	"dom_seats" integer,
	"intl_out_departures" integer,
	"intl_out_passengers" integer,
	"intl_out_seats" integer,
	"freight_lbs" double precision,
	"fetch_id" integer,
	CONSTRAINT "airport_traffic_monthly_airport_month_pk" PRIMARY KEY("airport","month")
);
--> statement-breakpoint
CREATE TABLE "airports" (
	"iata" text PRIMARY KEY NOT NULL,
	"icao" text,
	"name" text NOT NULL,
	"city" text,
	"region" text,
	"lat" double precision,
	"lon" double precision,
	"airport_type" text,
	"scheduled_service" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_segments_monthly" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"month" date NOT NULL,
	"origin" text NOT NULL,
	"dest" text NOT NULL,
	"dest_country" text,
	"carrier" text NOT NULL,
	"aircraft_type" text,
	"aircraft_config" text,
	"service_class" text,
	"distance_mi" integer,
	"departures_performed" integer NOT NULL,
	"seats" integer,
	"passengers" integer,
	"import_id" integer
);
--> statement-breakpoint
CREATE TABLE "source_fetches" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"url_or_file" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_start" date,
	"period_end" date,
	"status" text NOT NULL,
	"row_count" integer,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "airport_delays_monthly" ADD CONSTRAINT "airport_delays_monthly_import_id_source_fetches_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."source_fetches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport_traffic_monthly" ADD CONSTRAINT "airport_traffic_monthly_fetch_id_source_fetches_id_fk" FOREIGN KEY ("fetch_id") REFERENCES "public"."source_fetches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_segments_monthly" ADD CONSTRAINT "route_segments_monthly_import_id_source_fetches_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."source_fetches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "airports_region_idx" ON "airports" USING btree ("region");--> statement-breakpoint
CREATE INDEX "route_segments_origin_month_idx" ON "route_segments_monthly" USING btree ("origin","month");