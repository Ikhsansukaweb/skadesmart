import "dotenv/config";
import { runMigrations } from "./index";

runMigrations();
console.log("Migrasi database selesai.");
