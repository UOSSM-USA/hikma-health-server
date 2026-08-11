/**
 * An inventory row whose `drug_id` points at a drug that is not on the device
 * must still render.
 *
 * Same defect class as `PatientVisitItem`: the relation errors inside
 * `withObservables`, which re-throws during render, so the error boundary
 * replaces the whole editor instead of dropping one row.
 */

import { Database } from "@nozbe/watermelondb"

import { createTestDatabase, resetTestDatabase } from "../helpers/testDatabase"
import { render } from "../helpers/renderWithProviders"

// Import-time shims only. `@nozbe/watermelondb/react` is deliberately NOT mocked
// — the real `withObservables` is exactly what is under test here.
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: () => null,
  BottomSheetModalProvider: ({ children }: any) => children,
  BottomSheetScrollView: ({ children }: any) => children,
}))

jest.mock("react-native-keyboard-controller", () => {
  const RN = require("react-native")
  return {
    KeyboardAwareScrollView: RN.ScrollView,
    KeyboardProvider: ({ children }: any) => children,
  }
})

jest.mock("react-native-edge-to-edge", () => ({
  SystemBars: () => null,
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
  useScrollToTop: jest.fn(),
}))

import ClinicInventoryModel from "@/db/model/ClinicInventory"
import DrugCatalogueModel from "@/db/model/DrugCatalogue"
import { InventoryItem } from "@/screens/PrescriptionEditorFormScreen"

let db: Database

async function seedInventory(drugId: string | null): Promise<ClinicInventoryModel> {
  return db.write(async () =>
    db.get<ClinicInventoryModel>("clinic_inventory").create((row) => {
      const raw = row._raw as any
      raw.drug_id = drugId
      raw.clinic_id = "clinic-1"
      raw.quantity_available = 12
      raw.is_deleted = false
    }),
  )
}

async function seedDrug(brandName: string): Promise<DrugCatalogueModel> {
  return db.write(async () =>
    db.get<DrugCatalogueModel>("drug_catalogue").create((row) => {
      const raw = row._raw as any
      raw.brand_name = brandName
      raw.generic_name = "amoxicillin"
      raw.form = "tablet"
      raw.route = "oral"
      raw.dosage_quantity = 500
      raw.dosage_units = "mg"
      raw.is_deleted = false
    }),
  )
}

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(async () => {
  await resetTestDatabase(db)
})

describe("InventoryItem with an unresolvable drug", () => {
  it("renders a row whose drug is missing from the device", async () => {
    const item = await seedInventory("2f9a1c10-6dd4-11ef-bcb7-3d1c6bf6e95a")

    const { findByText } = render(<InventoryItem inventoryItem={item} />)

    expect(await findByText("Drug details unavailable")).toBeTruthy()
  })

  it("renders a row that has no drug id at all", async () => {
    const item = await seedInventory(null)

    const { findByText } = render(<InventoryItem inventoryItem={item} />)

    expect(await findByText("Drug details unavailable")).toBeTruthy()
  })

  it("shows the drug details when the drug is present", async () => {
    const drug = await seedDrug("Amoxil")
    const item = await seedInventory(drug.id)

    const { findByTestId } = render(<InventoryItem inventoryItem={item} />)

    expect(await findByTestId(`drug-brand-name-${drug.id}`)).toBeTruthy()
  })
})
