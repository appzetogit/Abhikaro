/**
 * Delegates to the frontend pure-logic test (single source of truth for labels).
 * Run from repo: cd backend && npm run test:delivery-payment-labels
 */
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, "../../../frontend");

execSync("npm run test:delivery-payment-labels", {
  cwd: frontendRoot,
  stdio: "inherit",
  shell: true,
});
