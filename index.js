import { CID } from 'multiformats/cid'

export const pdpVerifierAbi = [
  // Returns the next proof set ID
  'function getNextProofSetId() public view returns (uint64)',
  // Returns false if the proof set is 1) not yet created 2) deleted
  'function proofSetLive(uint256 setId) public view returns (bool)',
  // Returns false if the proof set is not live or if the root id is 1) not yet created 2) deleted
  'function rootLive(uint256 setId, uint256 rootId) public view returns (bool)',
  // Returns the next root ID for a proof set
  'function getNextRootId(uint256 setId) public view returns (uint256)',
  // Returns the root CID for a given proof set and root ID
  'function getRootCid(uint256 setId, uint256 rootId) public view returns (tuple(bytes))',
]

/**
 * @typedef {{
 *   getNextProofSetId(): Promise<BigInt>
 *   proofSetLive(setId: BigInt): Promise<Boolean>
 *   rootLive(setId: BigInt, rootId: BigInt): Promise<Boolean>
 *   getNextRootId(setId: BigInt): Promise<BigInt>
 *   getRootCid(setId: BigInt, rootId: BigInt): Promise<[string]>
 * }} PdpVerifier
 */

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {string} args.CDN_URL
 */
export async function sampleRetrieval({ pdpVerifier, CDN_URL }) {
  const cid = await pickRandomFile(pdpVerifier)
  const url = `${CDN_URL}/${cid}`
  console.log('Fetching', url)
  const res = await fetch(url)
  console.log('-> Status code:', res.status)
  if (!res.ok) {
    console.log((await res.text()).trim())
  } else if (res.body) {
    const reader = res.body.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }
  console.log()
}

/**
 * @param {PdpVerifier} pdpVerifier
 * @returns {Promise<string>} The CommP CID of the file.
 */
async function pickRandomFile(pdpVerifier) {
  while (true) {
    const nextProofSetId = await pdpVerifier.getNextProofSetId()
    console.log('Number of proof sets:', nextProofSetId)
    // Safety: this will break after the number of proofsets grow over MAX_SAFE_INTEGER (9e15)
    // We don't expect to keep running this bot for long enough to hit this limit
    const setId = BigInt(Math.floor(Math.random() * Number(nextProofSetId)))
    console.log('Picked proof set id:', setId)

    const proofSetLive = await pdpVerifier.proofSetLive(setId)
    if (!proofSetLive) {
      console.log('Proof set is not live, restarting the sampling algorithm')
      continue
    }

    const nextRootId = await pdpVerifier.getNextRootId(setId)
    console.log('Number of roots:', nextRootId)

    // Safety: this will break after the number of roots grow over MAX_SAFE_INTEGER (9e15)
    // We don't expect any proofset to contain so many roots
    const rootId = BigInt(Math.floor(Math.random() * Number(nextRootId)))
    console.log('Picked root id:', rootId)

    const rootLive = await pdpVerifier.rootLive(setId, rootId)
    if (!rootLive) {
      console.log('Root is not live, restarting the sampling algorithm')
      continue
    }

    const [rootCidRaw] = await pdpVerifier.getRootCid(setId, rootId)
    console.log('Found CommP:', rootCidRaw)
    const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
    const rootCid = CID.decode(cidBytes)
    console.log('Converted to CommP CID:', rootCid)
    return rootCid.toString()
  }
}
