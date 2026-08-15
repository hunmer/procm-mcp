// Minimal ambient declaration for popups-file-dialog. The package ships a
// file-dialog.d.ts at its root but its package.json has no "types" entry, so
// tsc cannot discover it on its own.
declare module "popups-file-dialog" {
  export const openDirectory: (opts?: { title?: string }) => Promise<string>;
}
