import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

const queryClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient, { schema });
