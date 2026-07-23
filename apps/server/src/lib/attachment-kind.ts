export type AttachmentKind = "image" | "pdf" | "file";

/**
 * Classify an attachment for display from its mimetype. Kept dependency-free so
 * client bundles can import it without pulling in the server-only upload
 * helpers. Unknown or absent types fall back to a generic file, so a viewer
 * never tries to inline-render bytes it can't identify.
 */
export const attachmentKind = (
  mimetype: string | null | undefined,
): AttachmentKind => {
  if (!mimetype) return "file";
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype.startsWith("image/")) return "image";
  return "file";
};
