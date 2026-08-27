// Resolve hook mapping "@/x" → "<repo>/src/x(.ts)" for plain-node script
// runs (registered by scripts/register-paths.mjs). Extensionless imports
// get ".ts" appended — Node's ESM resolver requires explicit extensions
// (the Next.js bundler does not).
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let href = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    if (!/\.[a-z]+$/.test(new URL(href).pathname)) href += ".ts";
    return next(href, context);
  }
  return next(specifier, context);
}
