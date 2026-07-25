// ==========================================================================
// TOMBSTONE — commented out 2026-07-26 · DELETE AFTER 2027-01-26
//
// Retired together with the plain-type field model in `models/event-form.ts`
// (`HHField` and friends), of which this file was one of the last consumers.
//
// Unreachable when tombstoned: `forms/components-registry.tsx` is imported by
// nothing, and it is the only importer of `forms/components/input.tsx`;
// `forms/builder-context.tsx`'s exports (`FormBuilderContextProvider`,
// `useFormBuilderContext`) had no references outside their own file.
// `forms/fields.ts` is NOT part of this cluster — `routes/api/entries.backfill.ts`
// still uses its `createOptionsField`, so it stays live.
//
// Commented rather than deleted so the shape stays readable while any straggler
// surfaces. Delete outright, with the tombstoned types, on the date above.
// ==========================================================================

// import EventForm from "@/models/event-form";
// import { MultiSelect } from "@/components/multi-select";
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// import eq from "lodash/eq";
// import React from "react";
// import { Label } from "@/components/ui/label";
// import { Select } from "@/components/ui/select";

// export const OptionsInput = React.memo(
//   ({ field }: { field: EventForm.HHFieldWithPosition | EventForm.HHField }) => {
//     const inputProps = {
//       // @ts-expect-error
//       placeholder: field.placeholder,
//       label: field.name,
//       description: field.description,
//       required: field.required,
//       // @ts-expect-error
//       multi: field.multi,
//       // value: field.value,
//     };

//     switch (field.inputType) {
//       case "radio":
//         return (
//           // @ts-expect-erro
//           <RadioGroup name={field.name} {...inputProps}>
//             <div className="mt-2">
//               {field.options.map((option) => (
//                 <div className="flex items-center space-x-2" key={option.value}>
//                   <RadioGroupItem value={option.value} id={option.value} />
//                   <Label htmlFor={option.value}>{option.label}</Label>
//                 </div>
//               ))}
//             </div>
//           </RadioGroup>
//         );
//       case "select":
//       default:
//         // @ts-expect-error
//         if (field.multi) {
//           return (
//             <MultiSelect
//               // @ts-expect-error
//               data={field.options}
//               // @ts-expect-error
//               multiple={field.multi}
//               {...inputProps}
//               // @ts-expect-error
//               // field={field}
//             />
//           );
//         } else {
//           return (
//             // @ts-expect-erro
//             <Select
//               options={field.options || []}
//               {...inputProps}
//               // field={field}
//             />
//           );
//         }
//     }
//   },
//   (pres, next) => eq(pres.field, next.field)
// );
