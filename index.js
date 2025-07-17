import { CID } from 'multiformats/cid'
import assert from 'node:assert'

// A list of (setId, rootCid) pairs to not retrieve because the SP is not serving retrievals
const IGNORED_ROOTS = [
  '212:baga6ea4seaqjlh5gvyf4v4nuwige3nynttmus2kxgr4s6c6rf2pjfkr5cu4rgci',
  '339:baga6ea4seaqnx4gnoeuqjyu7ctmhqtow4nnzukdfuyw3wr5bm73o5vlvbl5mgny',
  '442:baga6ea4seaqnbpfza3wl5fgu7gnfcyh5h6zufn4skwt6clylnzaw5k6maiwt6ay',
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
  'function getProviderIdByAddress(address provider) external view returns (uint256)',
  `function getApprovedProvider(uint256 providerId) external view returns (tuple(
    address owner,
    string pdpUrl,
    string pieceRetrievalUrl,
    uint256 registeredAt,
    uint256 approvedAt,
  ) memory)`,
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
 *   owner: string
 *   pdpUrl: string
 *   pieceRetrievalUrl: string
 *   registeredAt: BigInt
 *   approvedAt: BigInt
 * }} ApprovedProviderInfo
 */

/**
 * @typedef {{
 *   getProofSetWithCDN(setId: BigInt): Promise<boolean>
 *   getProofSet(setId: BigInt): Promise<ProofSetInfo>
 *   isProviderApproved(provider: string): Promise<boolean>
 *   getProviderIdByAddress(provider: string): Promise<BigInt>
 *   getApprovedProvider(providerId: BigInt): Promise<ApprovedProviderInfo>
 * }} PandoraService
 */

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {PandoraService} args.pandoraService
 * @param {string} args.clientAddress
 * @param {string} args.CDN_HOSTNAME
 * @param {string} args.rootCid
 * @param {BigInt} args.setId
 * @param {BigInt} args.rootId
 * @param {boolean} [args.retryOn404=true] Default is `true`
 * @param {number} [args.retryDelayMs=10_000] Default is `10_000`
 * @returns {Promise<void>}
 */
async function testRetrieval({
  pdpVerifier,
  pandoraService,
  clientAddress,
  CDN_HOSTNAME,
  rootCid,
  setId,
  rootId,
  retryOn404 = true,
  retryDelayMs = 10_000,
}) {
  const url = `https://${clientAddress}.${CDN_HOSTNAME}/${rootCid}`
  console.log('Fetching', url)
  const res = await fetch(url)
  console.log('-> Status code:', res.status)
  if (!res.ok) {
    const reason = (await res.text()).trim()
    console.log(reason)

    if (res.status === 404 && retryOn404) {
      console.log(
        `Retrying once after ${retryDelayMs}ms due to 404 error, maybe the indexer hasn't caught up yet`,
      )
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      return testRetrieval({
        pdpVerifier,
        pandoraService,
        clientAddress,
        CDN_HOSTNAME,
        rootCid,
        setId,
        rootId,
        retryOn404: false,
      })
    }

    const proofSetIdHeaderValue = res.headers.get('x-proof-set-id')
    const pieceRetrievalUrl = await maybeGetResolvedProofSetRetrievalUrl({
      pdpVerifier,
      pandoraService,
      proofSetIdHeaderValue,
    })

    console.error(
      'ALERT Cannot retrieve ProofSet %s Root %s (resolved as ProofSet %s from SP %s) via %s: %s %s',
      String(setId),
      String(rootId),
      proofSetIdHeaderValue ?? '<not reported>',
      pieceRetrievalUrl
        ? (URL.parse(pieceRetrievalUrl)?.hostname ?? pieceRetrievalUrl)
        : '<unknown>',
      url,
      res.status,
      reason,
    )
  } else if (res.body) {
    const reader = res.body.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }
}

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {PandoraService} args.pandoraService
 * @param {string | null} args.proofSetIdHeaderValue
 * @returns {Promise<string | undefined>} The piece retrieval URL
 */
async function maybeGetResolvedProofSetRetrievalUrl({
  pdpVerifier,
  pandoraService,
  proofSetIdHeaderValue,
}) {
  if (proofSetIdHeaderValue === null || proofSetIdHeaderValue === '') {
    return undefined
  }

  let proofSetId
  try {
    proofSetId = BigInt(proofSetIdHeaderValue)
  } catch (err) {
    console.warn(
      'FilCDN reported invalid ProofSetID %j: %s',
      proofSetIdHeaderValue,
      err,
    )
    return undefined
  }

  try {
    const [proofSetOwner] = await pdpVerifier.getProofSetOwner(proofSetId)
    const providerId =
      await pandoraService.getProviderIdByAddress(proofSetOwner)
    const providerInfo = await pandoraService.getApprovedProvider(providerId)
    return providerInfo.pieceRetrievalUrl
  } catch (err) {
    console.warn(
      'Failed to fetch owner & provider info for ProofSetID %s: %s',
      proofSetId,
      err,
    )
    return undefined
  }
}

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

  await testRetrieval({
    pdpVerifier,
    pandoraService,
    clientAddress,
    CDN_HOSTNAME,
    rootCid,
    setId,
    rootId,
  })
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
  /** @type {Map<BigInt, ProofSetInfo>} */
  const cachedProofSetsInfo = new Map()

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

    const proofSetLive = await pdpVerifier.proofSetLive(setId)
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

    if (!withCDN) {
      console.log(
        'Proof set does not pay for CDN, restarting the sampling algorithm',
      )
      continue
    }

    const providerIsApproved =
      await pandoraService.isProviderApproved(providerAddress)
    if (!providerIsApproved) {
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

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {PandoraService} args.pandoraService
 * @param {string} args.CDN_HOSTNAME
 */

export async function testLatestRetrievableRoot({
  pdpVerifier,
  pandoraService,
  CDN_HOSTNAME
}) {
  const { rootCid, proofSetId, rootId, clientAddress } = await getMostRecentFileWithCDN(
    {
      pdpVerifier,
      pandoraService
    },
  )

  await testRetrieval({
    pdpVerifier,
    pandoraService,
    clientAddress,
    CDN_HOSTNAME,
    rootCid,
    setId: proofSetId,
    rootId,
  })
}

/**
 * @param {Object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {PandoraService} args.pandoraService
 * @returns {Promise<{
 *   rootCid: string
 *   proofSetId: BigInt
 *   rootId: BigInt
 *   clientAddress: string
 * }>}
 *   The CommP CID of the file.
 */
async function getMostRecentFileWithCDN({
  pdpVerifier,
  pandoraService
}) {
  for (
    let proofSetId = (await pdpVerifier.getNextProofSetId()) - 1n;
    proofSetId >= 0n;
    proofSetId--
  ) {
    console.log('Checking proof set ID:', proofSetId)

    const proofSetLive = await pdpVerifier.proofSetLive(proofSetId)
    if (!proofSetLive) {
      console.log('Proof set is not live')
      continue
    }

    const info = await pandoraService.getProofSet(proofSetId)
    const { withCDN, payer: clientAddress, payee: providerAddress } = info

    if (!withCDN) {
      console.log(
        'Proof set does not pay for CDN',
      )
      continue
    }

    const providerIsApproved =
      await pandoraService.isProviderApproved(providerAddress)
    if (!providerIsApproved) {
      console.log('Provider is not approved')
      continue
    }

    console.log('Proofset client:', clientAddress)

    // Pick the most recently uploaded file that wasn't deleted yet.

    for (
      let rootId = await pdpVerifier.getNextRootId(proofSetId) - 1n;
      rootId >= 0n;
      rootId--
    ) {
      console.log('Checking root ID:', rootId)
      const rootIsLive = await pdpVerifier.rootLive(proofSetId, rootId)
      if (!rootIsLive) {
        console.log('Root is not live')
        continue
      }

      const [rootCidRaw] = await pdpVerifier.getRootCid(proofSetId, rootId)
      console.log('Found CommP:', rootCidRaw)
      const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
      const rootCidObj = CID.decode(cidBytes)
      console.log('Converted to CommP CID:', rootCidObj)
      const rootCid = rootCidObj.toString()

      if (IGNORED_ROOTS.includes(`${proofSetId}:${rootCid}`)) {
        console.log('We are ignoring this root')
        continue
      }

      return { rootCid, proofSetId, rootId, clientAddress }
    }
  }

  throw new Error('No suitable root found')
}
