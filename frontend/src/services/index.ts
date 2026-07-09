/**
 * Active service adapter. Uses the real Supabase backend when the project env
 * vars are present (frontend/.env.local); otherwise falls back to the in-memory
 * mock so the app still runs with zero configuration.
 */
import { apiServices } from "./api";
import { isSupabaseConfigured } from "./api/client";
import { mockServices } from "./mock";
import type { Services } from "./types";

export const services: Services = isSupabaseConfigured ? apiServices : mockServices;
export type { Credentials, ProductInput, Services, SignupInput } from "./types";
