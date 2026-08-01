import Peer from "@/models/Peer"

const { mergeResumeState, readResumeState } = Peer

const state: Peer.ResumeState = {
  cursor: "abc",
  since: 0,
  snapshotTs: 1_800_000_000_000,
  pagesApplied: 3,
  recordsApplied: 1500,
}

describe("resume state in peers.metadata", () => {
  // `metadata` is the only place the peer URL lives (`Peer.getUrl` reads
  // `metadata.url`). Replacing the blob rather than merging would leave the peer
  // unreachable — a far worse failure than losing a resume cursor.
  it("stores resume state without discarding the peer url", () => {
    const merged = mergeResumeState({ url: "https://api.test" }, state)
    expect(merged.url).toBe("https://api.test")
    expect(readResumeState(merged)).toEqual(state)
  })

  it("round-trips through the metadata blob", () => {
    expect(readResumeState(mergeResumeState({}, state))).toEqual(state)
  })

  it("clears resume state while preserving other metadata", () => {
    const withState = mergeResumeState({ url: "https://api.test" }, state)
    const cleared = mergeResumeState(withState, null)
    expect(cleared.url).toBe("https://api.test")
    expect(readResumeState(cleared)).toBeNull()
  })

  it("returns null when no resume state is present", () => {
    expect(readResumeState({ url: "https://api.test" })).toBeNull()
  })

  it("returns null for a malformed resume blob rather than throwing", () => {
    expect(readResumeState({ manualSyncResume: "not-an-object" })).toBeNull()
  })

  it("returns null when the blob is missing a cursor", () => {
    expect(readResumeState({ manualSyncResume: { since: 0 } })).toBeNull()
  })

  // The caller passes `rec.metadata` straight in. Mutating it would corrupt the
  // live record before `.update()` decides what to persist.
  it("does not mutate the metadata it is given", () => {
    const original = { url: "https://api.test" }
    const merged = mergeResumeState(original, state)
    expect(original).toEqual({ url: "https://api.test" })
    expect(merged).not.toBe(original)
  })

  it("does not mutate when clearing either", () => {
    const withState = mergeResumeState({ url: "https://api.test" }, state)
    mergeResumeState(withState, null)
    expect(readResumeState(withState)).toEqual(state)
  })

  // An empty cursor is not a resumable position — it would be sent to the server
  // as `cursor: ""`, which `sync.backfillPull` rejects as a malformed cursor.
  // Treating it as absent restarts the run instead, which is recoverable.
  it("treats an empty cursor as no resume state", () => {
    expect(readResumeState({ manualSyncResume: { ...state, cursor: "" } })).toBeNull()
  })

  it("defaults the progress counters when they are missing", () => {
    const partial = { manualSyncResume: { cursor: "c", since: 5, snapshotTs: 7 } }
    expect(readResumeState(partial)).toEqual({
      cursor: "c",
      since: 5,
      snapshotTs: 7,
      pagesApplied: 0,
      recordsApplied: 0,
    })
  })

  it("returns null for a null metadata blob", () => {
    expect(readResumeState(null as never)).toBeNull()
  })

  // `Peer`'s column sanitiser hands `{}` through for anything non-object, so a
  // peer that has never stored metadata reads as an empty blob, not undefined.
  it("stores resume state onto an empty blob", () => {
    expect(readResumeState(mergeResumeState({}, state))).toEqual(state)
  })
})
