import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  attachmentColumnHeaders,
  attachmentLinksForField,
  planAttachmentColumns,
} from "../../src/lib/export-attachment-links";

// The export hands `{ text, hyperlink }` to addRow inside a plain array. If
// ExcelJS ever stringifies that instead, every file column reads "[object Object]".
describe("hyperlink cells in an ExcelJS worksheet", () => {
  const linkContext = {
    baseUrl: "https://portal.example.org",
    token: "grant-token",
    tokenParam: "t",
  };

  it("writes an array-passed link object as a real hyperlink cell", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("Sheet");
    worksheet.addRow([
      "event-1",
      { text: "scan.pdf", hyperlink: "https://portal.example.org/file" },
      "",
    ]);

    const cell = worksheet.getCell(1, 2).value as {
      text: string;
      hyperlink: string;
    };
    expect(cell.hyperlink).toBe("https://portal.example.org/file");
    expect(cell.text).toBe("scan.pdf");
  });

  it("lays out a multi-file field so every link gets its own clickable cell", () => {
    const field = {
      fieldId: "f1",
      value: ["r1", "r2"],
      attachments: [
        { id: "r1", fileName: "front.png", mimetype: "image/png" },
        { id: "r2", fileName: "back.png", mimetype: "image/png" },
      ],
    };

    const layout = planAttachmentColumns([2]);
    const worksheet = new ExcelJS.Workbook().addWorksheet("Sheet");
    worksheet.addRow(["ID", ...attachmentColumnHeaders("X-Ray", layout)]);

    const links = attachmentLinksForField({
      ...linkContext,
      eventId: "event-1",
      field,
    });
    worksheet.addRow([
      "event-1",
      ...Array.from({ length: layout.linkColumns }, (_, column) => {
        const link = links[column];
        return link ? { text: link.label, hyperlink: link.url } : "";
      }),
    ]);

    expect(worksheet.getRow(1).values).toEqual([
      undefined,
      "ID",
      "X-Ray",
      "X-Ray (2)",
    ]);

    const first = worksheet.getCell(2, 2).value as { hyperlink: string };
    const second = worksheet.getCell(2, 3).value as { hyperlink: string };
    expect(first.hyperlink).toBe(
      "https://portal.example.org/api/events/event-1/attachments/r1?t=grant-token",
    );
    expect(second.hyperlink).toBe(
      "https://portal.example.org/api/events/event-1/attachments/r2?t=grant-token",
    );
  });

  it("keeps column alignment when an event has no attachments", () => {
    const layout = planAttachmentColumns([0, 3]);
    const worksheet = new ExcelJS.Workbook().addWorksheet("Sheet");

    const links = attachmentLinksForField({
      ...linkContext,
      eventId: "event-2",
      field: { fieldId: "f1", value: [] },
    });
    worksheet.addRow([
      "event-2",
      ...Array.from({ length: layout.linkColumns }, (_, column) => {
        const link = links[column];
        return link ? { text: link.label, hyperlink: link.url } : "";
      }),
      "patient-1",
    ]);

    expect(layout.linkColumns).toBe(3);
    expect(worksheet.getCell(1, 5).value).toBe("patient-1");
  });

  it("survives a round trip through the xlsx writer", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet").addRow([
      "event-1",
      {
        text: "scan.pdf",
        hyperlink:
          "https://portal.example.org/api/events/event-1/attachments/r1?t=grant-token",
      },
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as ArrayBuffer);

    const cell = reloaded.getWorksheet("Sheet")?.getCell(1, 2).value as {
      hyperlink: string;
    };
    expect(cell.hyperlink).toBe(
      "https://portal.example.org/api/events/event-1/attachments/r1?t=grant-token",
    );
  });
});
