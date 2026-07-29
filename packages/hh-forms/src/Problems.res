// Projection of an event's submitted diagnoses onto the patient's problem
// list.
//
// Shared because both clients write events — the mobile app to WatermelonDB
// when offline, the server over RPC when online — and both must record the
// same problems from the same form.
//
// Nothing here touches storage.

@genType
type problem = {
  code: string,
  label: string,
}

// A problem already on the chart, carrying the id needed to retire it.
@genType
type recordedProblem = {
  id: string,
  code: string,
  label: string,
}

// One submitted value from an event's `form_data`. `value` stays untyped
// because its shape differs per field type; only diagnosis fields are read
// here, and only when their field opted in.
@genType
type formDataItem = {
  fieldId: string,
  fieldType: string,
  value: JSON.t,
}

// An authored form field, narrowed to what the projection reads. Forms
// authored before the flag existed carry no `addToProblems`, which reads as
// "do not record".
@genType
type field = {
  id: string,
  fieldType: string,
  addToProblems?: bool,
}

// What an event's diagnoses should put on the chart.
//
// `recordsProblems` is false when no diagnosis field opts in. Callers must
// then leave the problem list alone entirely rather than read an empty
// `problems` as "remove everything", so that turning the flag off never
// erases problems already recorded.
@genType
type projection = {
  recordsProblems: bool,
  problems: array<problem>,
}

@genType
type diff = {
  toCreate: array<problem>,
  toRemoveIds: array<string>,
}

@genType
type problemCodeSystem = [#icd10cm | #snomed | #icd11 | #icd10]

@genType
type clinicalStatus = [#active | #remission | #resolved | #unknown]

@genType
type verificationStatus = [#provisional | #confirmed | #refuted | #unconfirmed]

// The chart row a recorded diagnosis becomes, with every value both clients
// must agree on already decided.
@genType
type newProblem = {
  codeSystem: problemCodeSystem,
  code: string,
  label: string,
  clinicalStatus: clinicalStatus,
  verificationStatus: verificationStatus,
}

let diagnosisFieldType = "diagnosis"

// Identity of a problem within one event. The label is part of the key
// because relabelling a diagnosis makes it a different entry on the chart —
// and because events saved before free-text diagnoses got unique codes share
// the bare "0000" placeholder, where the label is all that separates them.
let key = (code: string, label: string): string => code ++ "::" ++ label

let problemKey = (p: problem): string => key(p.code, p.label)

let recordedKey = (p: recordedProblem): string => key(p.code, p.label)

let keySet = (problems: array<problem>): dict<bool> => {
  let keys = Dict.make()
  problems->Array.forEach(p => keys->Dict.set(problemKey(p), true))
  keys
}

let has = (keys: dict<bool>, k: string): bool => keys->Dict.get(k)->Option.isSome

// The diagnoses in one submitted value, dropping anything that is not a
// `{code, desc}` pair with both parts present.
let diagnosisEntries = (value: JSON.t): array<problem> =>
  switch value {
  | Array(entries) =>
    entries->Array.filterMap(entry =>
      switch entry {
      | Object(obj) =>
        switch (obj->Dict.get("code"), obj->Dict.get("desc")) {
        | (Some(String(code)), Some(String(label))) if code != "" && label != "" =>
          Some({code, label})
        | _ => None
        }
      | _ => None
      }
    )
  | _ => []
  }

/**
 * Which problems an event's diagnoses should put on the patient's chart,
 * keeping only those whose form field is marked `addToProblems`.
 *
 * Duplicates within one event collapse to a single problem.
 */
@genType
let problemsFromFormData = (formData: array<formDataItem>, fields: array<field>): projection => {
  let recordingFieldIds = Dict.make()
  fields->Array.forEach(field =>
    if field.fieldType == diagnosisFieldType && field.addToProblems == Some(true) {
      recordingFieldIds->Dict.set(field.id, true)
    }
  )

  if recordingFieldIds->Dict.keysToArray->Array.length == 0 {
    {recordsProblems: false, problems: []}
  } else {
    let seen = Dict.make()
    let problems = []
    formData->Array.forEach(item =>
      if item.fieldType == diagnosisFieldType && recordingFieldIds->has(item.fieldId) {
        diagnosisEntries(item.value)->Array.forEach(problem => {
          let k = problemKey(problem)
          if !(seen->has(k)) {
            seen->Dict.set(k, true)
            problems->Array.push(problem)
          }
        })
      }
    )
    {recordsProblems: true, problems}
  }
}

// Widths of the `problem_code` and `problem_label` columns. A free-text
// diagnosis is unbounded user input, and a clamped label beats a row the sync
// push rejects outright.
let codeLengthMax = 100
let labelLengthMax = 255

let clamp = (value: string, lengthMax: int): string =>
  String.length(value) > lengthMax ? value->String.slice(~start=0, ~end=lengthMax) : value

/**
 * The chart row to write for a recorded diagnosis.
 *
 * Both diagnosis pickers are backed by the same ICD-11 subset, so the code
 * system is fixed. A diagnosis a provider entered on a form is an asserted,
 * ongoing problem that nobody has confirmed against a second source yet.
 */
@genType
let toNewProblem = (p: problem): newProblem => {
  codeSystem: #icd11,
  code: clamp(p.code, codeLengthMax),
  label: clamp(p.label, labelLengthMax),
  clinicalStatus: #active,
  verificationStatus: #provisional,
}

/**
 * Compare the problems an event already recorded against the ones it should
 * now record.
 *
 * A diagnosis the event asked for last time but that is no longer on the
 * chart was taken off deliberately — by a clinician editing the problem list
 * or by an admin on the server. Re-saving the event must not undo that, so
 * `alreadyRequested` suppresses the re-create. Only a diagnosis that is new
 * to this event produces a problem.
 */
@genType
let diffProblems = (
  existing: array<recordedProblem>,
  desired: array<problem>,
  alreadyRequested: array<problem>,
): diff => {
  let desiredKeys = keySet(desired)
  let requestedKeys = keySet(alreadyRequested)

  let existingKeys = Dict.make()
  existing->Array.forEach(p => existingKeys->Dict.set(recordedKey(p), true))

  let toCreate = desired->Array.filter(p => {
    let k = problemKey(p)
    !(existingKeys->has(k)) && !(requestedKeys->has(k))
  })

  let toRemoveIds =
    existing
    ->Array.filter(p => !(desiredKeys->has(recordedKey(p))))
    ->Array.map(p => p.id)

  {toCreate, toRemoveIds}
}
