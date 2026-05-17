// Authoring-time cycle detection for `computedValue` rules.
//
// A cyclic `computedValue` dependency (A reads B, B reads A) causes the
// mobile runtime to oscillate. `stabilizeComputedValues` caps the loop
// and suppresses writebacks, but the form is still broken from the
// user's perspective. This module is the author-time gate — the
// form-builder Save handlers call `detectComputedValueCycles` and block
// save when any cycle is reported.
//
// Why static graph analysis (rather than actually running the
// evaluator with empty values): a runtime oscillation requires a graph
// cycle. Static analysis is at-least-as-strict and doesn't depend on
// the JSONLogic engine at all — we walk the JSON tree once, collect
// `{var: "form.<id>"}` references, build the dependency graph, and run
// Tarjan's SCC.
//
// Scope: edges only between fields that both have `computedValue`
// rules. A reference from A's `computedValue` to B's value is
// irrelevant unless B's value can also be re-written — and only
// `computedValue` writes. visibleIf / requiredIf / validators don't
// write, so they can never participate in a runtime oscillation.

let formVarPrefix = "form."

// Walk a rule and collect every field id it references via
// `{var: "form.<id>"}` (also `form.<id>.subpath` and the array-form of
// `var`). Pathological computed paths (`{var: {cat: [...]}}`) are
// skipped — we can't statically resolve them. The acceptable failure
// mode is a false-negative on the cycle check, not a false-positive:
// a missed reference means a real runtime cycle slips past authoring
// and gets caught by `stabilizeComputedValues`' iteration cap.

let pathToFieldId = (path: string): option<string> =>
  if String.startsWith(path, formVarPrefix) {
    let rest = String.slice(
      path,
      ~start=String.length(formVarPrefix),
      ~end=String.length(path),
    )
    switch String.indexOf(rest, ".") {
    | -1 => if String.length(rest) > 0 { Some(rest) } else { None }
    | idx => if idx > 0 { Some(String.slice(rest, ~start=0, ~end=idx)) } else { None }
    }
  } else {
    None
  }

// Iterative tree walk with a hard node-visit cap.
//
// Recursion would blow the JS call stack on deeply-nested user JSON
// (advanced-mode rule editor accepts pasted arbitrary depth, and this
// runs before the parser's depth gate on the Save handler path). The
// cap is a defensive ceiling — well-formed rules are bounded by the
// engine's parser at depth 256, but `extractReferencedFieldIds` operates
// on the raw JSON.t before validation, so we must self-bound.
let maxCollectRefsVisits: int = 50_000

let collectRefs = (root: JSON.t, ids: dict<bool>): unit => {
  let stack: array<JSON.t> = [root]
  let visited = ref(0)
  while Array.length(stack) > 0 && visited.contents < maxCollectRefsVisits {
    visited := visited.contents + 1
    let node = Array.pop(stack)->Option.getUnsafe
    // ReScript collapses our empty Null/primitive arms with the catch-all
    // and dispatches Object via `typeof === "object"`; in JS,
    // `typeof null === "object"`, so an unguarded match would read
    // `null["var"]` and throw. Classify explicitly via JSON.Classify so
    // null lands in the Null arm instead of the Object arm.
    switch JSON.Classify.classify(node) {
    | Array(items) => items->Array.forEach(r => Array.push(stack, r))
    | Object(obj) =>
      switch obj->Dict.get("var") {
      | Some(arg) =>
        // `var` arg is treated terminally — we extract the static path
        // if present and DO NOT recurse into computed-path arguments.
        // Mirrors the original semantics: pathological `{var: {cat: ...}}`
        // shapes can't be statically resolved and produce a false-negative
        // on the cycle check rather than a false-positive.
        let pathOpt = switch arg {
        | String(s) => Some(s)
        | Array(a) if Array.length(a) > 0 =>
          switch a[0]->Option.getUnsafe {
          | String(s) => Some(s)
          | _ => None
          }
        | _ => None
        }
        switch pathOpt {
        | Some(path) =>
          switch pathToFieldId(path) {
          | Some(fid) => ids->Dict.set(fid, true)
          | None => ()
          }
        | None => ()
        }
      | None => obj->Dict.valuesToArray->Array.forEach(v => Array.push(stack, v))
      }
    | Null | Bool(_) | Number(_) | String(_) => ()
    }
  }
}

@genType
let extractReferencedFieldIds = (rule: option<JSON.t>): array<string> => {
  let ids: dict<bool> = Dict.make()
  switch rule {
  | None | Some(Null) => ()
  | Some(r) => collectRefs(r, ids)
  }
  ids->Dict.keysToArray
}

@genType
type computedValueCycle = {fieldIds: array<string>}

@genType
type fieldWithComputed = {
  id: string,
  computedValue?: JSON.t,
}

// Iterative DFS state per root: which neighbor index we're processing.
type frame = {node: string, mutable edgeIdx: int}

// Tarjan's SCC algorithm, iterative to avoid stack overflow on long
// chains (forms can carry hundreds of fields and JS's call-stack limit
// is platform-dependent).
let tarjanSCC = (
  nodes: array<string>,
  edges: dict<array<string>>,
): array<array<string>> => {
  let index: dict<int> = Dict.make()
  let lowlink: dict<int> = Dict.make()
  let onStack: dict<bool> = Dict.make()
  let sccStack: array<string> = []
  let sccs: array<array<string>> = []
  let counter = ref(0)

  nodes->Array.forEach(root => {
    switch index->Dict.get(root) {
    | Some(_) => ()
    | None => {
        let callStack: array<frame> = [{node: root, edgeIdx: 0}]
        index->Dict.set(root, counter.contents)
        lowlink->Dict.set(root, counter.contents)
        counter := counter.contents + 1
        Array.push(sccStack, root)
        onStack->Dict.set(root, true)

        while Array.length(callStack) > 0 {
          let top = Array.length(callStack) - 1
          let frame = callStack[top]->Option.getUnsafe
          let neighbors = switch edges->Dict.get(frame.node) {
          | Some(ns) => ns
          | None => []
          }
          if frame.edgeIdx < Array.length(neighbors) {
            let w = neighbors[frame.edgeIdx]->Option.getUnsafe
            frame.edgeIdx = frame.edgeIdx + 1
            switch index->Dict.get(w) {
            | None => {
                index->Dict.set(w, counter.contents)
                lowlink->Dict.set(w, counter.contents)
                counter := counter.contents + 1
                Array.push(sccStack, w)
                onStack->Dict.set(w, true)
                Array.push(callStack, {node: w, edgeIdx: 0})
              }
            | Some(_) =>
              switch onStack->Dict.get(w) {
              | Some(true) =>
                // Back-edge: update lowlink to min(current, index[w]).
                let curLow = lowlink->Dict.get(frame.node)->Option.getUnsafe
                let wIdx = index->Dict.get(w)->Option.getUnsafe
                if wIdx < curLow {
                  lowlink->Dict.set(frame.node, wIdx)
                }
              | _ => ()
              }
            }
          } else {
            // Done with this node's neighbors. If it's an SCC root, pop.
            let low = lowlink->Dict.get(frame.node)->Option.getUnsafe
            let idx = index->Dict.get(frame.node)->Option.getUnsafe
            if low === idx {
              let scc: array<string> = []
              let popping = ref(true)
              while popping.contents {
                switch Array.pop(sccStack) {
                | None => popping := false
                | Some(w) =>
                  onStack->Dict.set(w, false)
                  Array.push(scc, w)
                  if w === frame.node {
                    popping := false
                  }
                }
              }
              Array.push(sccs, scc)
            }
            let _ = Array.pop(callStack)
            if Array.length(callStack) > 0 {
              // Propagate lowlink up to parent: min(parentLow, thisLow).
              let parent = callStack[Array.length(callStack) - 1]->Option.getUnsafe
              let parentLow = lowlink->Dict.get(parent.node)->Option.getUnsafe
              let thisLow = lowlink->Dict.get(frame.node)->Option.getUnsafe
              if thisLow < parentLow {
                lowlink->Dict.set(parent.node, thisLow)
              }
            }
          }
        }
      }
    }
  })

  sccs
}

// Detect strongly-connected components in the `computedValue`
// dependency graph and return any that represent a cycle. Each cycle
// is an array of field ids in SCC stack-pop order (NOT topological /
// path order). A self-loop returns a one-element cycle.
//
// Empty result = no cycles.
@genType
let detectComputedValueCycles = (
  fields: array<fieldWithComputed>,
): array<computedValueCycle> => {
  let computedIds: dict<bool> = Dict.make()
  fields->Array.forEach(f =>
    switch f.computedValue {
    | Some(_) => computedIds->Dict.set(f.id, true)
    | None => ()
    }
  )
  let computedIdArr = computedIds->Dict.keysToArray
  if Array.length(computedIdArr) === 0 {
    []
  } else {
    // Build the restricted graph: edges only between computedValue-having
    // nodes. References to non-computedValue fields can't participate
    // in an oscillation, so drop them.
    let edges: dict<array<string>> = Dict.make()
    fields->Array.forEach(f =>
      switch f.computedValue {
      | None => ()
      | Some(cv) =>
        let refs = extractReferencedFieldIds(Some(cv))
        let filtered =
          refs->Array.filter(id =>
            switch computedIds->Dict.get(id) {
            | Some(true) => true
            | _ => false
            }
          )
        edges->Dict.set(f.id, filtered)
      }
    )
    let sccs = tarjanSCC(computedIdArr, edges)
    let cycles: array<computedValueCycle> = []
    sccs->Array.forEach(scc => {
      if Array.length(scc) > 1 {
        Array.push(cycles, {fieldIds: scc})
      } else {
        // Single-node SCC is only a cycle if there's a self-edge.
        let id = scc[0]->Option.getUnsafe
        let outgoing = switch edges->Dict.get(id) {
        | Some(arr) => arr
        | None => []
        }
        if outgoing->Array.includes(id) {
          Array.push(cycles, {fieldIds: [id]})
        }
      }
    })
    cycles
  }
}
