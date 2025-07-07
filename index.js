import { CID } from 'multiformats/cid'
import assert from 'node:assert'
import { OWNER_TO_RETRIEVAL_URL_MAPPING } from './vendored/retriever-constants.js'

// A list of (setId, rootCid) pairs to not retrieve because the SP is not serving retrievals
const IGNORED_ROOTS = [
  '212:baga6ea4seaqjlh5gvyf4v4nuwige3nynttmus2kxgr4s6c6rf2pjfkr5cu4rgci',
  '339:baga6ea4seaqnx4gnoeuqjyu7ctmhqtow4nnzukdfuyw3wr5bm73o5vlvbl5mgny',
]

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
  // Returns the owner of a proof set and the proposed owner if any
  'function getProofSetOwner(uint256 setId) public view returns (address, address)',
]

/**
 * @typedef {{
 *   getNextProofSetId(): Promise<BigInt>
 *   proofSetLive(setId: BigInt): Promise<Boolean>
 *   rootLive(setId: BigInt, rootId: BigInt): Promise<Boolean>
 *   getNextRootId(setId: BigInt): Promise<BigInt>
 *   getRootCid(setId: BigInt, rootId: BigInt): Promise<[string]>
 *   getProofSetOwner(setId: BigInt): Promise<[string, string]>
 *   isProviderApproved(provider: string): Promise<Boolean>
 * }} PdpVerifier
 */

export const pandoraServiceAbi = [
  'function getProofSetWithCDN(uint256 proofSetId) external view returns (bool)',
  `function getProofSet(uint256 proofSetId) external view returns (tuple(
    uint256 railId,
    address payer,
    address payee,
    uint256 commissionBps,
    string metadata,
    string[] rootMetadata,
    uint256 clientDataSetId,
    bool withCDN,
  ) memory)`,
  'function isProviderApproved(address provider) external view returns (bool)',
]

/**
 * @typedef {{
 *   railId: BigInt
 *   payer: string
 *   payee: string
 *   commissionBps: BigInt
 *   metadata: string
 *   rootMetadata: string[]
 *   clientDataSetId: BigInt
 *   withCDN: boolean
 * }} ProofSetInfo
 */

/**
 * @typedef {{
 *   getProofSetWithCDN(setId: BigInt): Promise<boolean>
 *   getProofSet(setId: BigInt): Promise<ProofSetInfo>
 *   isProviderApproved(provider: string): Promise<boolean>
 * }} PandoraService
 */

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {PandoraService} args.pandoraService
 * @param {string} args.CDN_HOSTNAME
 * @param {BigInt} args.FROM_PROOFSET_ID
 */

export async function sampleRetrieval({
  pdpVerifier,
  pandoraService,
  CDN_HOSTNAME,
  FROM_PROOFSET_ID,
}) {
  const { rootCid, setId, rootId, clientAddress } = await pickRandomFileWithCDN(
    {
      pdpVerifier,
      pandoraService,
      FROM_PROOFSET_ID,
    },
  )

  const [proofSetOwner] = await pdpVerifier.getProofSetOwner(setId)
  const ownerUrl =
    OWNER_TO_RETRIEVAL_URL_MAPPING[proofSetOwner.toLowerCase()]?.url
  const isSupportedSP = !!ownerUrl
  console.log(
    'Proof set owner: %s (%s) supported? %s',
    proofSetOwner,
    ownerUrl ?? 'unknown SP',
    isSupportedSP,
  )

  const url = `https://${clientAddress}.${CDN_HOSTNAME}/${rootCid}`
  console.log('Fetching', url)
  const res = await fetch(url)
  console.log('-> Status code:', res.status)
  if (!res.ok) {
    const reason = (await res.text()).trim()
    console.log(reason)

    if (isSupportedSP) {
      console.error(
        'ALERT Cannot retrieve ProofSet %s Root %s SP %s via %s: %s %s',
        String(setId),
        String(rootId),
        URL.parse(ownerUrl)?.hostname ?? ownerUrl,
        url,
        res.status,
        reason,
      )
    }
  } else if (res.body) {
    const reader = res.body.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }

    // NOTE: Even if the SP (ProofSet owner) is not supported, the retrieval can still
    // succeed in case that somebody else stored the same file with a participating SP.
    // For that reason, we are not alerting when this happens.
  }
}

/**
 * @param {Object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {PandoraService} args.pandoraService
 * @param {BigInt} args.FROM_PROOFSET_ID
 * @returns {Promise<{
 *   rootCid: string
 *   setId: BigInt
 *   rootId: BigInt
 *   clientAddress: string
 * }>}
 *   The CommP CID of the file.
 */
async function pickRandomFileWithCDN({
  pdpVerifier,
  pandoraService,
  FROM_PROOFSET_ID,
}) {
  // Cache state query responses to speed up the sampling algorithm.
  /** @type {Map<BigInt, boolean>} */
  const cachedProofSetsLive = new Map()
  /** @type {Map<BigInt, ProofSetInfo>} */
  const cachedProofSetsInfo = new Map()
  /** @type {Map<string, boolean>} */
  const cachedApprovedProviders = new Map()

  const nextProofSetId = await pdpVerifier.getNextProofSetId()
  console.log('Number of proof sets:', nextProofSetId)
  assert(
    FROM_PROOFSET_ID < nextProofSetId,
    `FROM_PROOFSET_ID ${FROM_PROOFSET_ID} must be less than the number of existing proof sets ${nextProofSetId}`,
  )

  while (true) {
    // Safety: this will break after the number of proofsets grow over MAX_SAFE_INTEGER (9e15)
    // We don't expect to keep running this bot for long enough to hit this limit
    const setId =
      FROM_PROOFSET_ID +
      BigInt(
        Math.floor(Math.random() * Number(nextProofSetId - FROM_PROOFSET_ID)),
      )
    console.log('Picked proof set id:', setId)

    const proofSetLive =
      cachedProofSetsLive.get(setId) ?? (await pdpVerifier.proofSetLive(setId))
    cachedProofSetsLive.set(setId, proofSetLive)

    if (!proofSetLive) {
      console.log('Proof set is not live, restarting the sampling algorithm')
      continue
    }

    const info =
      cachedProofSetsInfo.get(setId) ??
      (await pandoraService.getProofSet(setId))
    cachedProofSetsInfo.set(setId, info)
    const { withCDN, payer: clientAddress, payee: providerAddress } = info
    // console.log('Proof Set info from Pandora Service', info)
    const providerIsApproved =
      cachedApprovedProviders.get(providerAddress) ??
      (await pandoraService.isProviderApproved(providerAddress))
    cachedApprovedProviders.set(providerAddress, providerIsApproved)

    if (!providerIsApproved) {
      console.log('Provider is not approved, restarting the sampling algorithm')
      continue
    }

    if (!withCDN) {
      console.log(
        'Proof set does not pay for CDN, restarting the sampling algorithm',
      )
      continue
    }
    if (!(await pdpVerifier.proofSetLive(setId))) {
      cachedProofSetsLive.set(setId, false)
      console.log(
        'Proof set does is not live anymore, updating cache and restarting the sampling algorithm',
      )
      continue
    }
    if (!(await pandoraService.isProviderApproved(providerAddress))) {
      cachedApprovedProviders.set(providerAddress, false)
      console.log('Provider is not approved, restarting the sampling algorithm')
      continue
    }
    console.log('Proofset client:', clientAddress)

    const nextRootId = await pdpVerifier.getNextRootId(setId)
    console.log('Number of roots:', nextRootId)

    // Pick the most recently uploaded file that wasn't deleted yet.

    let rootId = nextRootId - 1n
    let rootLive = false
    let remainingAttempts = Math.min(5, Number(nextRootId))
    while (remainingAttempts > 0 && rootId >= 0n) {
      rootLive = await pdpVerifier.rootLive(setId, rootId)
      if (rootLive) break

      console.log('Root %s is not live, trying an older file', rootId)
      remainingAttempts--
      rootId--
    }

    if (!rootLive) {
      console.log('No more attempts left, restarting the sampling algorithm')
      continue
    }

    console.log('Picked root id:', rootId)

    const [rootCidRaw] = await pdpVerifier.getRootCid(setId, rootId)
    console.log('Found CommP:', rootCidRaw)
    const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
    const rootCidObj = CID.decode(cidBytes)
    console.log('Converted to CommP CID:', rootCidObj)
    const rootCid = rootCidObj.toString()

    if (IGNORED_ROOTS.includes(`${setId}:${rootCid}`)) {
      console.log(
        'We are ignoring this root, restarting the sampling algorithm',
      )
      continue
    }

    return { rootCid, setId, rootId, clientAddress }
  }
}
