import fc from "fast-check"

import Event from "../../app/models/Event"
import EventForm from "../../app/models/EventForm"

describe("Event.readAttachments", () => {
  it("joins resource ids to their display metadata by id", () => {
    expect(
      Event.readAttachments({
        value: ["res1", "res2"],
        attachments: [
          { id: "res2", fileName: "referral.pdf", mimetype: "application/pdf" },
          { id: "res1", fileName: "scan.jpg", mimetype: "image/jpeg" },
        ],
      }),
    ).toEqual([
      { id: "res1", fileName: "scan.jpg", mimetype: "image/jpeg" },
      { id: "res2", fileName: "referral.pdf", mimetype: "application/pdf" },
    ])
  })

  // `value` is the authority on which files the field has, so ordering and
  // membership follow it — stale metadata cannot add or drop a file.
  it("follows value for order and membership, not attachments", () => {
    const result = Event.readAttachments({
      value: ["res2", "res1"],
      attachments: [{ id: "res3", fileName: "ghost.pdf", mimetype: null }],
    })
    expect(result.map((attachment) => attachment.id)).toEqual(["res2", "res1"])
  })

  it("yields null metadata for an id with no matching record", () => {
    expect(Event.readAttachments({ value: ["res1"] })).toEqual([
      { id: "res1", fileName: null, mimetype: null },
    ])
  })

  it("reads absent, empty, or non-array values as no attachments", () => {
    expect(Event.readAttachments({})).toEqual([])
    expect(Event.readAttachments({ value: [] })).toEqual([])
    expect(Event.readAttachments({ value: "res1" })).toEqual([])
  })

  it("drops non-string and empty ids", () => {
    expect(
      Event.readAttachments({ value: ["res1", "", 42, null] as unknown as string[] }),
    ).toEqual([{ id: "res1", fileName: null, mimetype: null }])
  })

  it("never throws and always returns an array", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = Event.readAttachments({ value } as never)
        expect(Array.isArray(result)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})

describe("Event.readAttachments — adversarial", () => {
  // A repeated id renders twice under the same React key. `value` is a set of
  // resource ids, so duplicates must collapse.
  it("collapses duplicate ids", () => {
    const result = Event.readAttachments({ value: ["res1", "res1", "res2", "res1"] })
    expect(result.map((attachment) => attachment.id)).toEqual(["res1", "res2"])
  })

  it("never emits duplicate ids for any input", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 40 }), (value) => {
        const ids = Event.readAttachments({ value }).map((a) => a.id)
        expect(new Set(ids).size).toBe(ids.length)
      }),
      { numRuns: 300 },
    )
  })

  // form_data is unvalidated jsonb; a crafted payload can nest arbitrarily.
  it("survives a deeply nested attachments payload", () => {
    let nested: unknown = "leaf"
    for (let i = 0; i < 10_000; i++) nested = { id: nested }
    expect(() =>
      Event.readAttachments({ value: ["res1"], attachments: [nested] } as never),
    ).not.toThrow()
  })

  it("does not let a polluted prototype supply attachment metadata", () => {
    const hostile = JSON.parse(
      '{"value":["res1"],"attachments":[{"__proto__":{"fileName":"pwn"},"id":"res1"}]}',
    )
    expect(Event.readAttachments(hostile)[0]?.fileName).toBeNull()
    expect(({} as Record<string, unknown>).fileName).toBeUndefined()
  })
})

describe("Event.getHtmlEventDisplay — attachment name escaping", () => {
  const eventWith = (attachments: Event.Attachment[]): Event.T => ({
    ...Event.empty,
    eventType: "Visit",
    formData: [
      {
        fieldId: "f1",
        name: "Scan",
        fieldType: "file",
        inputType: "file",
        value: attachments.map((a) => a.id),
        attachments,
      },
    ],
  })

  // Filenames originate from the device and travel through sync, so the report
  // must treat them as untrusted when interpolating into HTML.
  it("escapes markup in a filename instead of emitting it", () => {
    const html = Event.getHtmlEventDisplay(
      eventWith([
        {
          id: "res1",
          fileName: "<script>alert(1)</script>.jpg",
          mimetype: "image/jpeg",
        },
      ]),
      "en",
    )
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("escapes every attachment in a multi-file field, not just the first", () => {
    const html = Event.getHtmlEventDisplay(
      eventWith([
        { id: "res1", fileName: "safe.jpg", mimetype: "image/jpeg" },
        { id: "res2", fileName: "<img onerror=x>.pdf", mimetype: "application/pdf" },
      ]),
      "en",
    )
    expect(html).toContain("safe.jpg")
    expect(html).not.toContain("<img onerror")
  })

  it("never emits an unescaped angle bracket from a filename", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (fileName) => {
        const html = Event.getHtmlEventDisplay(
          eventWith([{ id: "res1", fileName, mimetype: null }]),
          "en",
        )
        const rendered = html.slice(html.indexOf("[Attachment:"))
        expect(rendered).not.toMatch(/<(?!\/?div)/)
      }),
      { numRuns: 300 },
    )
  })
})

describe("EventForm.fileFieldLimits", () => {
  // Older authored forms carry none of these props and must keep behaving as
  // a single optional file.
  it("defaults an unannotated field to one optional file", () => {
    expect(EventForm.fileFieldLimits({})).toEqual({ minItems: 0, maxItems: 1 })
  })

  it("pins a non-multiple field to one file whatever maxItems claims", () => {
    expect(EventForm.fileFieldLimits({ multiple: false, maxItems: 5 })).toEqual({
      minItems: 0,
      maxItems: 1,
    })
  })

  it("honours the authored bounds on a multiple field", () => {
    expect(
      EventForm.fileFieldLimits({ multiple: true, minItems: 2, maxItems: 4 }),
    ).toEqual({ minItems: 2, maxItems: 4 })
  })

  it("bounds a multiple field that omits maxItems", () => {
    const limits = EventForm.fileFieldLimits({ multiple: true })
    expect(limits.maxItems).toBeGreaterThan(1)
    expect(Number.isFinite(limits.maxItems)).toBe(true)
  })

  it("never returns minItems above maxItems, or maxItems below one", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: -5, max: 50 }),
        fc.integer({ min: -5, max: 50 }),
        (multiple, minItems, maxItems) => {
          const limits = EventForm.fileFieldLimits({ multiple, minItems, maxItems })
          expect(limits.maxItems).toBeGreaterThanOrEqual(1)
          expect(limits.minItems).toBeGreaterThanOrEqual(0)
          expect(limits.minItems).toBeLessThanOrEqual(limits.maxItems)
        },
      ),
      { numRuns: 200 },
    )
  })
})
