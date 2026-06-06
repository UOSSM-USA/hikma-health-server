import { type Locator, type Page, expect } from "@playwright/test";
import { test } from "./fixtures/auth";
import { scrollIntoView } from "./helpers/scroll";

// ----------------------------------------------------------------------------
// Scenario 1 — "Rule round-trip in one form"
//
// Covers checklist items 1–6 against the live FormPreviewPane. No form save:
// preview is reactive to the builder state and saving redirects away from
// /app/event-forms/edit/new, so all assertions happen pre-save.
//
// Deviations from the literal checklist (no UI affordance for these):
//   - A is a Radio with "yes"/"no" options (no Boolean field in the
//     ComponentRegistry — mobile renderer FIXME at the route file).
//     Comparison reads "A equals yes".
//   - D / E are Text fields (no Number field in the registry). The
//     computedValue rule uses JsonLogic numeric coercion; we assert the
//     displayed value is "6", which catches the case where coercion is
//     accidentally string concat (would render "51").
//   - Item 5: medicine renders the real (inert) input group plus a
//     visible tip steering authors to the Prescriptions feature. There
//     is no simulate affordance — rules referencing the medicine field
//     stay at the seeded empty array in preview.
// ----------------------------------------------------------------------------

const FIELD_CARD = '[data-testid="field-card"]';

test.describe("Event-form builder — Scenario 1 rule round-trip", () => {
  // The scenario builds 8 fields, configures 4 rule sections across 3
  // fields (each section involves several Radix Select round-trips that
  // portal options to the document root and re-render the editor), then
  // drives the live preview pane. The body itself takes ~150s on local
  // hardware; 240s leaves headroom for the dev-server cold start and the
  // best-effort teardown. test.slow() (=3x default = 90s) is far too low.
  test.setTimeout(240_000);

  test("visibility, required, validator, computed, list stub, display-only", async ({
    authenticatedPage: page,
  }) => {
    // Collect React render-storm warnings throughout the test. Used by the
    // convergence assertion on the computed-value field below.
    const updateDepthWarnings: string[] = [];
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        /Maximum update depth exceeded/i.test(msg.text())
      ) {
        updateDepthWarnings.push(msg.text());
      }
    });

    // ----- 1. Open the new-event-form editor ---------------------------------
    await page.goto("/app/event-forms/edit/new");
    await page
      .getByLabel("Form Title")
      .fill(`E2E Rules Scenario ${Date.now()}`);

    // ----- 2. Add and name each field ---------------------------------------
    // Two helpers, both race-protecting against .last() by waiting on card
    // count before targeting the newest card. addAndName returns a
    // *stable* locator keyed by data-field-name — .last() is lazy and
    // re-evaluates at use time, so caching .last() would silently retarget
    // to the most-recently-added field (e.g. the trailing separator).
    let cardCount = 0;
    const addAndName = async (
      buttonName: string,
      fieldName: string,
    ): Promise<Locator> => {
      cardCount += 1;
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await expect(page.locator(FIELD_CARD)).toHaveCount(cardCount);
      await page.locator(FIELD_CARD).last().getByLabel("Name").fill(fieldName);
      return page.locator(`${FIELD_CARD}[data-field-name="${fieldName}"]`);
    };
    const addBare = async (buttonName: string): Promise<Locator> => {
      cardCount += 1;
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await expect(page.locator(FIELD_CARD)).toHaveCount(cardCount);
      return page.locator(FIELD_CARD).last(); // only safe before further adds
    };

    // A — Radio (boolean stand-in). Add yes/no options via the CreatableSelect.
    const cardA = await addAndName("Radio", "A");
    await addCreatableOptions(cardA, ["yes", "no"]);

    // B, C — Text inputs.
    const cardB = await addAndName("Text", "B");
    const cardC = await addAndName("Text", "C");

    // D, E — Text inputs (no Number button in registry).
    const cardD = await addAndName("Text", "D");
    const cardE = await addAndName("Text", "E");

    // F — Medicine.
    const cardF = await addAndName("Medicine", "F");

    // G — Text Block (display-only). No Name input on this card; address it
    // by data-field-type ("text" is the TextDisplayField2 tag — distinct
    // from the free-text input cards which carry "free-text").
    const cardG = await addBare("Text Block");
    await cardG.getByLabel("Text Content").fill("Section header");
    // Text Size SelectInput uses Radix; the trigger isn't reliably labelled,
    // so use the underlying combobox role scoped to the card.
    await cardG.getByRole("combobox").click();
    await page.getByRole("option", { name: "Large" }).click();

    // H — Separator (no config). cardG is now stale (added-after), but we
    // don't reference cardG again, so no rebind needed.
    await addBare("Separator");

    // cardD and cardF carry no rule config — they're driven via the
    // preview pane below, not the builder. Touching them silences any
    // unused-locals lint without inventing fake reads.
    void cardD;
    void cardF;

    // ----- 3. Configure rules via FieldLogicPanel ---------------------------
    // Each field's logic panel toggle lives inside that field's card. Open
    // the panel, expand the section, drive the editor, save.

    // B: visibleIf — "Show when A equals yes".
    await openLogicPanel(cardB);
    await openSection(cardB, "visibility-section-toggle");
    await configureSimpleComparison(page, cardB, "visibility-section", {
      kindLabel: "Show when a field matches a value",
      fieldLabel: "A",
      operatorLabel: "equals",
      value: "yes",
    });
    await cardB
      .getByTestId("visibility-section")
      .getByTestId("rule-save")
      .click();

    // B: requiredIf — same predicate, different section.
    await openSection(cardB, "required-if-section-toggle");
    await configureSimpleComparison(page, cardB, "required-if-section", {
      kindLabel: "Required when a field matches a value",
      fieldLabel: "A",
      operatorLabel: "equals",
      value: "yes",
    });
    await cardB
      .getByTestId("required-if-section")
      .getByTestId("rule-save")
      .click();

    // The form scope keys values by field ID (nanoid), NOT field name —
    // the renderer does `setFieldValue(field.id, v)`. Hand-written Advanced
    // JSON has to substitute real IDs, or `{"var": "form.<name>"}` will
    // always resolve to undefined and the rule will never fire correctly.
    // The simple-mode editor handles this internally via
    // `compileVisibilityTemplate`, which is why items 1 + 2 (configured
    // through Simple) work without this dance.
    const fieldIdC = await readFieldId(cardC);
    const fieldIdD = await readFieldId(cardD);

    // C: validator — "must contain @". Author the rule via Advanced JSON since
    // the simple-mode "contains substring" template doesn't exist.
    await openLogicPanel(cardC);
    await openSection(cardC, "validators-section-toggle");
    const validatorsC = cardC.getByTestId("validators-section");
    await validatorsC.getByTestId("validators-add").click();
    await validatorsC.getByTestId("validator-message").fill("must contain @");
    // Switch the row's RuleEditor to Advanced mode.
    const validatorRow = validatorsC.getByTestId("validator-row-0");
    await validatorRow.getByTestId("rule-mode-advanced").click();
    await validatorRow
      .getByTestId("rule-advanced-textarea")
      .fill(`{"in": ["@", {"var": "form.${fieldIdC}"}]}`);
    await expect(
      validatorRow.getByTestId("rule-validation-badge"),
    ).toHaveAttribute("data-status", "ok");
    await validatorsC.getByTestId("validators-save").click();

    // E: computedValue — D + 1. Computed editor is Advanced-JSON-only.
    await openLogicPanel(cardE);
    await openSection(cardE, "computed-value-section-toggle");
    const computedE = cardE.getByTestId("computed-value-section");
    await computedE
      .getByTestId("rule-advanced-textarea")
      .fill(`{"+": [{"var": "form.${fieldIdD}"}, 1]}`);
    await expect(
      computedE.getByTestId("rule-validation-badge"),
    ).toHaveAttribute("data-status", "ok");
    await computedE.getByTestId("rule-save").click();

    // ----- 4. Exercise the preview pane -------------------------------------
    const preview = page.getByTestId("form-preview");
    const previewField = (name: string) =>
      preview.locator(`[data-field-name="${name}"]`);

    // Item 1 — Visibility: with A unset, B is hidden. Toggle A=yes, B
    // appears; A=no, B disappears.
    await expect(previewField("B")).toHaveCount(0);
    await previewField("A").getByLabel("yes").check();
    await expect(previewField("B")).toHaveCount(1);
    await previewField("A").getByLabel("no").check();
    await expect(previewField("B")).toHaveCount(0);

    // Item 2 — Required toggling: asterisk follows A's value.
    await previewField("A").getByLabel("yes").check();
    await expect(previewField("B").locator("span.text-destructive")).toHaveText(
      "*",
    );
    await previewField("A").getByLabel("no").check();
    await expect(previewField("B")).toHaveCount(0); // B hidden again
    // While B is hidden the asterisk question is moot; the visibility test
    // above already proved the rule fires. The asterisk-present check above
    // proves required-rule eval too.

    // Item 3 — Validator surfacing on C.
    await scrollIntoView(previewField("C"));
    const cInput = previewField("C").getByLabel("C");
    await cInput.fill("abc");
    await expect(
      previewField("C").locator("p.text-destructive", {
        hasText: "must contain @",
      }),
    ).toBeVisible();
    await cInput.fill("abc@x");
    await expect(
      previewField("C").locator("p.text-destructive", {
        hasText: "must contain @",
      }),
    ).toHaveCount(0);

    // Item 4 — Computed value + convergence on E.
    // Field E is rendered as a read-only computed display (preview-computed-display
    // <p> inside the preview-field for E). Type into D with pressSequentially so
    // each keystroke triggers a render — this is what would stress the React
    // update loop if there's a missed writeback short-circuit.
    const dInput = previewField("D").getByLabel("D");
    await dInput.click();
    await dInput.pressSequentially("5", { delay: 20 });
    await expect(
      previewField("E").getByTestId("preview-computed-display"),
    ).toHaveText("6");
    // Now extend rapidly to "5000" character by character. The computed
    // expression is D + 1; the displayed value should walk through 6, 51,
    // 501, 5001 and never lock the page.
    await dInput.pressSequentially("000", { delay: 5 });
    await expect(
      previewField("E").getByTestId("preview-computed-display"),
    ).toHaveText("5001");

    // Item 5 — Medicine preview. Renders the real (inert) input group —
    // Medicine Name / Form / Concentration / Unit / Frequency / Route —
    // for visual fidelity, plus a visible tip steering authors to the
    // dedicated Prescriptions feature. No simulate toggles.
    const cardFPreview = await scrollIntoView(previewField("F"));
    await expect(cardFPreview.getByLabel("Medicine Name")).toBeVisible();
    await expect(cardFPreview.getByLabel("Concentration")).toBeVisible();
    // The three SelectInputs of the input group: Form / Unit / Route.
    await expect(cardFPreview.getByRole("combobox")).toHaveCount(3);
    await expect(
      cardFPreview.getByText("dedicated Prescriptions feature"),
    ).toBeVisible();
    // The old simulate stubs are gone.
    await expect(
      cardFPreview.getByRole("button", { name: "1 selected" }),
    ).toHaveCount(0);

    // Item 6 — Display-only: G renders with the "lg" size class (text-xl
    // font-medium) and H renders as a separator. Address by data-field-tag
    // — Text Block and Separator have no Name input in the builder, so
    // their field.name stays at the registry default and `previewField`
    // (which keys off data-field-name) wouldn't find them.
    const gPreview = await scrollIntoView(
      preview.locator('[data-field-tag="text"]'),
    );
    await expect(gPreview.locator("p")).toHaveText("Section header");
    await expect(gPreview.locator("p.text-xl.font-medium")).toBeVisible();

    // Radix Separator emits role="none" by default (decorative); assert on
    // shape — a single child element with the my-4 spacing class — rather
    // than role.
    const hPreview = await scrollIntoView(
      preview.locator('[data-field-tag="separator"]'),
    );
    await expect(hPreview.locator(".my-4")).toBeVisible();

    // ----- 5. Convergence guard for item 4 (load-bearing) -------------------
    expect(
      updateDepthWarnings,
      `React reported "Maximum update depth exceeded" during the computed-value test; ` +
        `the writeback short-circuit is not converging. Sample: ${updateDepthWarnings[0]}`,
    ).toEqual([]);
  });
});

// ============================================================================
// Helpers — kept inline because they're scenario-specific and small.
// ============================================================================

/** Toggle the FieldLogicPanel open on a given field card. */
async function openLogicPanel(card: Locator): Promise<void> {
  await card.getByTestId("field-logic-toggle").click();
  await expect(card.getByTestId("field-logic-panel")).toBeVisible();
}

/** Click a CollapsibleSection header by its testId. */
async function openSection(card: Locator, headerTestId: string): Promise<void> {
  await card.getByTestId(headerTestId).click();
}

/**
 * Drive the SimpleRuleInput inside a section: pick the kind, pick the field,
 * pick the operator, type the value. The Radix Select option list portals to
 * document root, so we query options off `page`, not the section.
 */
async function configureSimpleComparison(
  page: Page,
  card: Locator,
  sectionTestId: string,
  args: {
    kindLabel: string;
    fieldLabel: string;
    operatorLabel: string;
    value: string;
  },
): Promise<void> {
  const section = card.getByTestId(sectionTestId);

  // Multi-condition sections (visibility / requiredIf) open on "Always"
  // with no rows — add the first condition, then drive it.
  await section.getByTestId("rule-add-condition").click();
  const row = section.getByTestId("condition-row-0");

  await row.getByTestId("rule-when-kind").click();
  await page.getByRole("option", { name: args.kindLabel }).click();

  await row.getByTestId("rule-field-picker").click();
  await page.getByRole("option", { name: args.fieldLabel, exact: true }).click();

  await row.getByTestId("rule-operator").click();
  await page.getByRole("option", { name: args.operatorLabel, exact: true }).click();

  await row.getByTestId("rule-value").fill(args.value);
}

/**
 * Add options to a CreatableSelect inside a field card (used for the Radio
 * field's yes/no options). Each label is typed and committed with Enter,
 * which CreatableSelect interprets as "create this option".
 */
async function addCreatableOptions(
  card: Locator,
  labels: ReadonlyArray<string>,
): Promise<void> {
  const combobox = card.getByRole("combobox").first();
  for (const label of labels) {
    await combobox.fill(label);
    await combobox.press("Enter");
  }
}

/**
 * Read a field card's stable id (nanoid set at field creation) from the
 * `data-field-id` attribute on its outer wrapper. Use for hand-authored
 * Advanced JSON rules — the form scope is keyed by this id, not by name.
 */
async function readFieldId(card: Locator): Promise<string> {
  const id = await card.getAttribute("data-field-id");
  if (!id) {
    throw new Error(
      "readFieldId: card has no data-field-id — was it the right card locator?",
    );
  }
  return id;
}
