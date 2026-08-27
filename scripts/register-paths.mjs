// Node resolve hook: map the tsconfig "@/" alias onto src/ so utility
// scripts can import app modules directly:
//   node --experimental-strip-types --import ./scripts/register-paths.mjs <script>
import { register } from "node:module";
register("./paths-loader.mjs", import.meta.url);
