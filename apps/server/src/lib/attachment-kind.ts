export type AttachmentKind = "image" | "pdf" | "file";

/**
 * One uploaded file on an event-form file field. `id` is the resource id — the
 * sole authorization key; `fileName` and `mimetype` are display metadata only.
 */
export type Attachment = {
  id: string;
  fileName: string | null;
  mimetype: string | null;
};

/**
 * Read the attachments off a file field's `form_data` entry.
 *
 * `value` holds the resource ids and is the authority on which files the field
 * has; `attachments` supplies display metadata, joined by id. An id with no
 * matching metadata record yields null name and mimetype, which viewers render
 * as a generic attachment.
 *
 * Total by construction: any absent, empty, or non-array `value` reads as no
 * attachments, so callers never branch on shape.
 */
export const readAttachments = (
  field: Record<string, unknown> | null | undefined,
): Attachment[] => {
  const value = field?.value;
  if (!Array.isArray(value)) return [];

  const metadataById = new Map<string, Attachment>();
  const attachments = field?.attachments;
  if (Array.isArray(attachments)) {
    for (const entry of attachments) {
      const id: unknown = entry?.id;
      if (typeof id !== "string") continue;
      metadataById.set(id, {
        id,
        fileName: typeof entry?.fileName === "string" ? entry.fileName : null,
        mimetype: typeof entry?.mimetype === "string" ? entry.mimetype : null,
      });
    }
  }

  // Deduped: `value` is a set of resource ids. A repeat carries no meaning
  // downstream and would collide as a render key.
  const seen = new Set<string>();
  const attached: Attachment[] = [];
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    attached.push({
      id,
      fileName: metadataById.get(id)?.fileName ?? null,
      mimetype: metadataById.get(id)?.mimetype ?? null,
    });
  }
  return attached;
};

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
