// npm run reset-leads — put data/leads.json back to the 5 sample leads and forget seen deliveries.
import { copyFileSync, rmSync } from "node:fs";

copyFileSync("data/leads.sample.json", "data/leads.json");
rmSync("data/deliveries.json", { force: true });
console.log("data/leads.json is back to the 5 sample leads.");
