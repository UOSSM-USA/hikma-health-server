import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_LINK_COLUMNS_MAX,
  attachmentColumnHeaders,
  attachmentLinksForField,
  attachmentOverflowCount,
  buildAttachmentUrl,
  planAttachmentColumns,
  readExportAttachments,
} from "../../src/lib/export-attachment-links";

const link = {
  baseUrl: "https://portal.example.org",
  token: "grant-token",
  tokenParam: "t",
};

const fieldWith = (ids: unknown, attachments?: unknown) => ({
  fieldId: "field-1",
  value: ids,
  ...(attachments === undefined ? {} : { attachments }),
});

describe("buildAttachmentUrl", () => {
  it("builds an absolute event-mediated URL carrying the grant token", () => {
    expect(
      buildAttachmentUrl({
        ...link,
        eventId: "event-1",
        resourceId: "resource-1",
      }),
    ).toBe(
      "https://portal.example.org/api/events/event-1/attachments/resource-1?t=grant-token",
    );
  });

  it("tolerates a trailing slash on the base URL", () => {
    expect(
      buildAttachmentUrl({
        ...link,
        baseUrl: "https://portal.example.org//",
        eventId: "event-1",
        resourceId: "resource-1",
      }),
    ).toBe(
      "https://portal.example.org/api/events/event-1/attachments/resource-1?t=grant-token",
    );
  });

  it("escapes token characters that would otherwise end the query value", () => {
    const url = buildAttachmentUrl({
      ...link,
      token: "a&b=c d",
      eventId: "event-1",
      resourceId: "resource-1",
    });
    expect(url.endsWith("?t=a%26b%3Dc%20d")).toBe(true);
  });
});

describe("readExportAttachments", () => {
  it("reads the array shape with its display metadata", () => {
    expect(
      readExportAttachments(
        fieldWith(
          ["r1"],
          [{ id: "r1", fileName: "scan.pdf", mimetype: "application/pdf" }],
        ),
      ),
    ).toEqual([
      { id: "r1", fileName: "scan.pdf", mimetype: "application/pdf" },
    ]);
  });

  it("accepts a legacy single-file string value", () => {
    expect(readExportAttachments(fieldWith("r1"))).toEqual([
      { id: "r1", fileName: null, mimetype: null },
    ]);
  });

  it("reads nothing from absent, empty or non-file values", () => {
    expect(readExportAttachments(undefined)).toEqual([]);
    expect(readExportAttachments(null)).toEqual([]);
    expect(readExportAttachments(fieldWith(""))).toEqual([]);
    expect(readExportAttachments(fieldWith(42))).toEqual([]);
    expect(readExportAttachments(fieldWith([]))).toEqual([]);
  });
});

describe("attachmentLinksForField", () => {
  it("labels each link with its filename", () => {
    const links = attachmentLinksForField({
      ...link,
      eventId: "event-1",
      field: fieldWith(
        ["r1", "r2"],
        [{ id: "r1", fileName: "front.png", mimetype: "image/png" }],
      ),
    });

    expect(links).toEqual([
      {
        label: "front.png",
        url: "https://portal.example.org/api/events/event-1/attachments/r1?t=grant-token",
      },
      {
        label: "Attachment 2",
        url: "https://portal.example.org/api/events/event-1/attachments/r2?t=grant-token",
      },
    ]);
  });

  it("stops at the column cap", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `r${i}`);
    const links = attachmentLinksForField({
      ...link,
      eventId: "event-1",
      field: fieldWith(ids),
    });
    expect(links).toHaveLength(ATTACHMENT_LINK_COLUMNS_MAX);
    expect(attachmentOverflowCount(fieldWith(ids))).toBe(
      40 - ATTACHMENT_LINK_COLUMNS_MAX,
    );
  });

  it("reports no overflow when every attachment fits", () => {
    expect(attachmentOverflowCount(fieldWith(["r1", "r2"]))).toBe(0);
  });
});

describe("planAttachmentColumns", () => {
  it("sizes the block to the widest answer in the sheet", () => {
    expect(planAttachmentColumns([1, 3, 2])).toEqual({
      linkColumns: 3,
      hasOverflowColumn: false,
    });
  });

  it("keeps one column when the sheet has no uploads at all", () => {
    expect(planAttachmentColumns([])).toEqual({
      linkColumns: 1,
      hasOverflowColumn: false,
    });
    expect(planAttachmentColumns([0, 0])).toEqual({
      linkColumns: 1,
      hasOverflowColumn: false,
    });
  });

  it("caps the block and flags an overflow column", () => {
    expect(planAttachmentColumns([2, ATTACHMENT_LINK_COLUMNS_MAX + 5])).toEqual(
      {
        linkColumns: ATTACHMENT_LINK_COLUMNS_MAX,
        hasOverflowColumn: true,
      },
    );
  });
});

describe("attachmentColumnHeaders", () => {
  it("numbers every column after the first", () => {
    expect(
      attachmentColumnHeaders("X-Ray", {
        linkColumns: 3,
        hasOverflowColumn: false,
      }),
    ).toEqual(["X-Ray", "X-Ray (2)", "X-Ray (3)"]);
  });

  it("appends the overflow column when one is planned", () => {
    expect(
      attachmentColumnHeaders("X-Ray", {
        linkColumns: 1,
        hasOverflowColumn: true,
      }),
    ).toEqual(["X-Ray", "X-Ray (not shown)"]);
  });
});
