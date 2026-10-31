// Node resolve hook for the validators: extensionless relative imports written in app/**/*.ts (the bundler style the app
// uses) resolve to the .ts file, so modules such as app/gyneco/body.ts run under Node's type stripping.
// Registered by scripts/gyneco/validate.mjs with module.registerHooks().
export function resolve(specifier,context,next){
 if(/^\.\.?\//.test(specifier)&&!/\.[a-z]+$/i.test(specifier)&&context.parentURL?.endsWith('.ts'))return next(specifier+'.ts',context);
 return next(specifier,context);
}
