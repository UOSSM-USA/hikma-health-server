import { type Attachment, readAttachments } from "@/lib/attachment-kind";

/**
 * Clickable attachment links for an exported workbook. Free of ExcelJS and of
 * any server-only import, so it is unit testable and safe in the client bundle.
 */

/**
 * `form_data` is unvalidated jsonb, so one malformed event with hundreds of ids
 * would otherwise widen the sheet for every row. Excess is counted in an
 * overflow column rather than dropped silently.
 */
export const ATTACHMENT_LINK_COLUMNS_MAX = 12;

export type AttachmentLink = {
  label: string;
  url: string;
};

export type AttachmentLinkContext = {
  baseUrl: string;
  token: string;
  tokenParam: string;
};

/** Gates minting a grant: an export with no file fields needs no credential. */
export const hasFileField = (formFields: unknown): boolean =>
  Array.isArray(formFields) &&
  formFields.some((field) => field?.fieldType === "file");

/**
 * The portal's reader, plus the legacy bare-string `value`. The download route
 * still honours that shape (`eventReferencesResource`) and today's export
 * prints it, so ignoring it here would lose links that currently resolve.
 */
export const readExportAttachments = (
  field: Record<string, unknown> | null | undefined,
): Attachment[] => {
  const value = field?.value;
  if (typeof value === "string" && value.length > 0) {
    return readAttachments({ ...field, value: [value] });
  }
  return readAttachments(field);
};

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

/** Absolute, because the workbook is opened outside the browser. */
export const buildAttachmentUrl = (params: {
  baseUrl: string;
  eventId: string;
  resourceId: string;
  token: string;
  tokenParam: string;
}): string => {
  const path = `${trimTrailingSlash(params.baseUrl)}/api/events/${encodeURIComponent(
    params.eventId,
  )}/attachments/${encodeURIComponent(params.resourceId)}`;
  const query = `${encodeURIComponent(params.tokenParam)}=${encodeURIComponent(params.token)}`;
  return `${path}?${query}`;
};

/** Links for one file field on one event, capped at ATTACHMENT_LINK_COLUMNS_MAX. */
export const attachmentLinksForField = (
  params: AttachmentLinkContext & {
    eventId: string;
    field: Record<string, unknown> | null | undefined;
  },
): AttachmentLink[] =>
  readExportAttachments(params.field)
    .slice(0, ATTACHMENT_LINK_COLUMNS_MAX)
    .map((attachment, index) => ({
      label: attachment.fileName ?? `Attachment ${index + 1}`,
      url: buildAttachmentUrl({
        baseUrl: params.baseUrl,
        eventId: params.eventId,
        resourceId: attachment.id,
        token: params.token,
        tokenParam: params.tokenParam,
      }),
    }));

/** Attachments a field holds beyond what the columns can show. */
export const attachmentOverflowCount = (
  field: Record<string, unknown> | null | undefined,
): number =>
  Math.max(
    0,
    readExportAttachments(field).length - ATTACHMENT_LINK_COLUMNS_MAX,
  );

export type AttachmentColumnLayout = {
  linkColumns: number;
  hasOverflowColumn: boolean;
};

/**
 * `linkColumns` never drops below one: an empty column reads as "no files",
 * where a missing column reads as a missing question.
 */
export const planAttachmentColumns = (
  attachmentCounts: readonly number[],
): AttachmentColumnLayout => {
  let observedMax = 0;
  for (const count of attachmentCounts) {
    if (count > observedMax) observedMax = count;
  }
  return {
    linkColumns: Math.max(
      1,
      Math.min(observedMax, ATTACHMENT_LINK_COLUMNS_MAX),
    ),
    hasOverflowColumn: observedMax > ATTACHMENT_LINK_COLUMNS_MAX,
  };
};

export const attachmentColumnHeaders = (
  fieldName: string,
  layout: AttachmentColumnLayout,
): string[] => {
  const headers = [fieldName];
  for (let position = 2; position <= layout.linkColumns; position++) {
    headers.push(`${fieldName} (${position})`);
  }
  if (layout.hasOverflowColumn) {
    headers.push(`${fieldName} (not shown)`);
  }
  return headers;
};
