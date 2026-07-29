import { Model } from "@nozbe/watermelondb"
import { field, text, date, relation, readonly, json } from "@nozbe/watermelondb/decorators"

import { sanitizeMetadata } from "@/utils/db"

import Patient from "./Patient"
import User from "./User"
import Visit from "./Visit"

export default class PatientProblem extends Model {
  static table = "patient_problems"

  static associations = {
    patients: { type: "belongs_to" as const, key: "patient_id" },
    visits: { type: "belongs_to" as const, key: "visit_id" },
    users: { type: "belongs_to" as const, key: "recorded_by_user_id" },
  }

  @text("patient_id") patientId!: string
  @text("visit_id") visitId?: string
  @text("recorded_by_user_id") recordedByUserId?: string

  @text("problem_code_system") problemCodeSystem!: string // e.g., 'icd11'
  @text("problem_code") problemCode!: string
  @text("problem_label") problemLabel!: string
  @text("clinical_status") clinicalStatus!: "active" | "remission" | "resolved" | "unknown"
  @text("verification_status") verificationStatus!:
    | "provisional"
    | "confirmed"
    | "refuted"
    | "unconfirmed"
  @field("severity_score") severityScore?: number

  @date("onset_date") onsetDate?: Date
  @date("end_date") endDate?: Date

  @json("metadata", sanitizeMetadata) metadata!: Record<string, unknown>
  @field("is_deleted") isDeleted!: boolean

  @readonly @date("created_at") createdAt!: Date
  @readonly @date("updated_at") updatedAt!: Date
  @readonly @date("deleted_at") deletedAt?: Date

  @relation("patients", "patient_id") patient!: Patient
  @relation("visits", "visit_id") visit?: Visit
  @relation("users", "recorded_by_user_id") recordedByUser?: User
}
