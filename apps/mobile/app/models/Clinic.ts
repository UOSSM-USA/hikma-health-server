import ClinicModel from "@/db/model/Clinic"
import ClinicDepartmentModel from "@/db/model/ClinicDepartment"
import { Option } from "effect"

namespace Clinic {
  export type T = {
    id: string
    name: string
    country: Option.Option<string>
    city: Option.Option<string>
    address: Option.Option<string>
    isDeleted: boolean
    createdAt: Date
    updatedAt: Date
    deletedAt: Option.Option<Date>
  }

  export type DBClinic = ClinicModel
  export type DBClinicDepartment = ClinicDepartmentModel

  /** Default empty Clinic Item */
  export const empty: T = {
    id: "",
    name: "",
    country: Option.none(),
    city: Option.none(),
    address: Option.none(),
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: Option.none(),
  }
}

export default Clinic
