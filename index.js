import { CID } from 'multiformats/cid'
import assert from 'node:assert'

// A list of (dataSetId, pieceCid) pairs to not retrieve because the SP is not serving retrievals
/** @type {string[]} */
const IGNORED_PIECES = []

// HTTP response status codes that are not actionable for us and we don't want to alert on them
const NO_ALERT_ON_RESPONSE_STATUS_CODES = [
  // Error 521 occurs when the origin web server refuses connections from Cloudflare.
  521,
]

export const pdpVerifierAbi = [
  // Returns the next data set ID
  'function getNextDataSetId() public view returns (uint64)',
  // Returns false if the data set is 1) not yet created 2) deleted
  'function dataSetLive(uint256 dataSetId) public view returns (bool)',
  // Returns false if the data set is not live or if the piece id is 1) not yet created 2) deleted
  'function pieceLive(uint256 dataSetId, uint256 pieceId) public view returns (bool)',
  // Returns the next piece ID for a data set
  'function getNextPieceId(uint256 dataSetId) public view returns (uint256)',
  // Returns the piece CID for a given data set and piece ID
  'function getPieceCid(uint256 dataSetId, uint256 pieceId) public view returns (tuple(bytes))',
  // Returns the owner of a data set and the proposed owner if any
  'function getDataSetOwner(uint256 dataSetId) public view returns (address, address)',
]

/**
 * @typedef {{
 *   getNextDataSetId(): Promise<BigInt>
 *   dataSetLive(setId: BigInt): Promise<Boolean>
 *   pieceLive(setId: BigInt, pieceId: BigInt): Promise<Boolean>
 *   getNextPieceId(setId: BigInt): Promise<BigInt>
 *   getPieceCid(setId: BigInt, pieceId: BigInt): Promise<[string]>
 *   getDataSetOwner(setId: BigInt): Promise<[string, string]>
 *   isProviderApproved(provider: string): Promise<Boolean>
 * }} PdpVerifier
 */

export const filecoinWarmStorageServiceAbi = [
  `function getDataSet(uint256 dataSetId) external view returns (tuple(
    uint256 pdpRailId,
    uint256 cacheMissRailId,
    uint256 cdnRailId,
    address payer,
    address payee,
    uint256 commissionBps,
    uint256 clientDataSetId,
    uint256 paymentEndEpoch,
  ) memory)`,
  `function getDataSetMetadata(uint256 dataSetId, string memory key) external view returns (bool exists, string memory value)`,
  `function approvedProviders(uint256 providerId) view returns (bool)`,
]

export const serviceProviderRegistryAbi = [
  'function getProviderByAddress(address provider) external view returns (uint256)',
  'function getPDPService(uint256 providerId) external view returns (tuple(tuple(string,uint256,uint256,bool,bool,uint256,uint256,string,address), string[] capabilityKeys, bool isActive) memory)',
  'function addressToProviderId(address provider) view returns (uint256)',
]

/**
 * @typedef {{
 *   pdpRailId: BigInt
 *   cacheMissRailId: BigInt
 *   cdnRailId: BigInt
 *   payer: string
 *   payee: string
 *   commissionBps: BigInt
 *   clientDataSetId: BigInt
 *   paymentEndEpoch: BigInt
 * }} DataSetInfo
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
 *   getDataSet(dataSetId: BigInt): Promise<DataSetInfo>
 *   getDataSetMetadata(
 *     dataSetId: BigInt,
 *     key: string,
 *   ): Promise<{
 *     exists: boolean
 *     value: string
 *   }>
 *   approvedProviders(providerId: BigInt): Promise<boolean>
 * }} FilecoinWarmStorageService
 */

/**
 * @typedef {{
 *   serviceURL: string
 *   minPieceSizeInBytes: number
 *   maxPieceSizeInBytes: number
 *   ipniPiece: boolean
 *   ipniIpfs: boolean
 *   storagePricePerTibPerMonth: number
 *   minProvingPeriodInEpochs: number
 *   location: string
 *   paymentTokenAddress: string
 * }} PDPOffering
 */

/**
 * @typedef {{
 *   isProviderActive(providerId: BigInt): Promise<BigInt>
 *   addressToProviderId(provider: string): Promise<BigInt>
 *   getPDPService(providerId: BigInt): Promise<{
 *     pdpOffering: PDPOffering
 *     capabilityKeys: string[]
 *     isActive: boolean
 *   }>
 * }} ServiceProviderRegistry
 */

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {FilecoinWarmStorageService} args.filecoinWarmStorageService
 * @param {ServiceProviderRegistry} args.serviceProviderRegistry
 * @param {string} args.clientAddress
 * @param {string} [args.botLocation] Fly region where the bot is running
 * @param {string} args.CDN_HOSTNAME
 * @param {string} args.pieceCid
 * @param {BigInt} args.dataSetId
 * @param {BigInt} args.pieceId
 * @param {boolean} [args.retryOn404=true] Default is `true`
 * @param {number} [args.retryDelayMs=10_000] Default is `10_000`
 * @returns {Promise<void>}
 */
async function testRetrieval({
  pdpVerifier,
  filecoinWarmStorageService,
  serviceProviderRegistry,
  clientAddress,
  botLocation,
  CDN_HOSTNAME,
  pieceCid,
  dataSetId,
  pieceId,
  retryOn404 = true,
  retryDelayMs = 10_000,
}) {
  const url = `https://${clientAddress}.${CDN_HOSTNAME}/${pieceCid}`
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
        serviceProviderRegistry,
        filecoinWarmStorageService,
        pdpVerifier,
        clientAddress,
        botLocation,
        CDN_HOSTNAME,
        pieceCid,
        dataSetId,
        pieceId,
        retryOn404: false,
      })
    }

    if (NO_ALERT_ON_RESPONSE_STATUS_CODES.includes(res.status)) {
      console.log('This error is not actionable for us, suppressing the alert.')
      return
    }

    const dataSetIdHeaderValue = res.headers.get('x-data-set-id')
    const pieceRetrievalUrl = await maybeGetResolvedDataSetRetrievalUrl({
      pdpVerifier,
      filecoinWarmStorageService,
      serviceProviderRegistry,
      dataSetIdHeaderValue,
    })

    console.error(
      'ALERT Cannot retrieve DataSet %s Piece %s (resolved as DataSet %s from SP %s) from %s via %s: %s %s',
      String(dataSetId),
      String(pieceId),
      dataSetIdHeaderValue ?? '<not reported>',
      pieceRetrievalUrl
        ? (URL.parse(pieceRetrievalUrl)?.hostname ?? pieceRetrievalUrl)
        : '<unknown>',
      botLocation ?? '<dev>',
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
 * @param {FilecoinWarmStorageService} args.filecoinWarmStorageService
 * @param {ServiceProviderRegistry} args.serviceProviderRegistry
 * @param {string | null} args.dataSetIdHeaderValue
 * @returns {Promise<string | undefined>} The piece retrieval URL
 */
async function maybeGetResolvedDataSetRetrievalUrl({
  pdpVerifier,
  filecoinWarmStorageService,
  serviceProviderRegistry,
  dataSetIdHeaderValue,
}) {
  if (dataSetIdHeaderValue === null || dataSetIdHeaderValue === '') {
    return undefined
  }

  let dataSetId
  try {
    dataSetId = BigInt(dataSetIdHeaderValue)
  } catch (err) {
    console.warn(
      'FilCDN reported invalid DataSetID %j: %s',
      dataSetIdHeaderValue,
      err,
    )
    return undefined
  }

  try {
    const [dataSetOwner] = await pdpVerifier.getDataSetOwner(dataSetId)
    const providerId =
      await serviceProviderRegistry.addressToProviderId(dataSetOwner)

    const isApproved =
      await filecoinWarmStorageService.approvedProviders(providerId)
    if (!isApproved) {
      console.warn(
        'Provider %s for DataSetID %s is not approved, skipping retrieval URL resolution',
        dataSetId,
        dataSetOwner,
      )
      return undefined
    }

    const { pdpOffering, isActive } =
      await serviceProviderRegistry.getPDPService(providerId)
    if (!isActive) {
      console.warn(
        'Provider %s for DataSetID %s is not active, skipping retrieval URL resolution',
        dataSetId,
        dataSetOwner,
      )
      return undefined
    }

    return pdpOffering.serviceURL
  } catch (err) {
    console.warn(
      'Failed to fetch owner & provider info for DataSetID %s: %s',
      dataSetId,
      err,
    )
    return undefined
  }
}

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {FilecoinWarmStorageService} args.filecoinWarmStorageService
 * @param {ServiceProviderRegistry} args.serviceProviderRegistry
 * @param {string} [args.botLocation] Fly region where the bot is running
 * @param {string} args.CDN_HOSTNAME
 * @param {BigInt} args.FROM_DATA_SET_ID
 */

export async function sampleRetrieval({
  pdpVerifier,
  filecoinWarmStorageService,
  serviceProviderRegistry,
  botLocation = '<dev>',
  CDN_HOSTNAME,
  FROM_DATA_SET_ID,
}) {
  const { pieceCid, dataSetId, pieceId, clientAddress } =
    await pickRandomFileWithCDN({
      pdpVerifier,
      filecoinWarmStorageService,
      serviceProviderRegistry,
      FROM_DATA_SET_ID,
    })

  await testRetrieval({
    pdpVerifier,
    filecoinWarmStorageService,
    serviceProviderRegistry,
    clientAddress,
    botLocation,
    CDN_HOSTNAME,
    pieceCid,
    dataSetId,
    pieceId,
  })
}

/**
 * @param {Object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {FilecoinWarmStorageService} args.filecoinWarmStorageService
 * @param {ServiceProviderRegistry} args.serviceProviderRegistry
 * @param {BigInt} args.FROM_DATA_SET_ID
 * @returns {Promise<{
 *   pieceCid: string
 *   dataSetId: BigInt
 *   pieceId: BigInt
 *   clientAddress: string
 * }>}
 *   The CommP CID of the file.
 */
async function pickRandomFileWithCDN({
  pdpVerifier,
  filecoinWarmStorageService,
  serviceProviderRegistry,
  FROM_DATA_SET_ID,
}) {
  // Cache state query responses to speed up the sampling algorithm.
  /** @type {Map<BigInt, DataSetInfo>} */
  const cachedDataSetsInfo = new Map()

  const nextDataSetId = await pdpVerifier.getNextDataSetId()
  console.log('Number of data sets:', nextDataSetId)
  assert(
    FROM_DATA_SET_ID < nextDataSetId,
    `FROM_DATA_SET_ID ${FROM_DATA_SET_ID} must be less than the number of existing data sets ${nextDataSetId}`,
  )

  while (true) {
    // Safety: this will break after the number of datasets grow over MAX_SAFE_INTEGER (9e15)
    // We don't expect to keep running this bot for long enough to hit this limit
    const dataSetId =
      FROM_DATA_SET_ID +
      BigInt(
        Math.floor(Math.random() * Number(nextDataSetId - FROM_DATA_SET_ID)),
      )
    console.log('Picked data set id:', dataSetId)

    const dataSetLive = await pdpVerifier.dataSetLive(dataSetId)
    if (!dataSetLive) {
      console.log('data set is not live, restarting the sampling algorithm')
      continue
    }

    const dataSet =
      cachedDataSetsInfo.get(dataSetId) ??
      (await filecoinWarmStorageService.getDataSet(dataSetId))
    cachedDataSetsInfo.set(dataSetId, dataSet)
    const { payer: clientAddress, payee: providerAddress } = dataSet
    const { exists: withCDNMetadaKeyExists, value: withCDNMetadataValue } =
      await filecoinWarmStorageService.getDataSetMetadata(dataSetId, 'withCDN')
    const withCDN = withCDNMetadaKeyExists && withCDNMetadataValue === 'true'

    if (!withCDN) {
      console.log(
        'data set does not pay for CDN, restarting the sampling algorithm',
      )
      continue
    }

    const providerId =
      await serviceProviderRegistry.addressToProviderId(providerAddress)

    const isProviderApproved =
      await filecoinWarmStorageService.approvedProviders(providerId)
    if (!isProviderApproved) {
      console.log('Provider is not approved, restarting the sampling algorithm')
      continue
    }

    const providerIsActive =
      await serviceProviderRegistry.isProviderActive(providerId)
    if (!providerIsActive) {
      console.log('Provider is not active, restarting the sampling algorithm')
      continue
    }

    console.log('dataset client:', clientAddress)

    const nextPieceId = await pdpVerifier.getNextPieceId(dataSetId)
    console.log('Number of pieces:', nextPieceId)

    // Pick the most recently uploaded file that wasn't deleted yet.

    let pieceId = nextPieceId - 1n
    let pieceLive = false
    let remainingAttempts = Math.min(5, Number(nextPieceId))
    while (remainingAttempts > 0 && pieceId >= 0n) {
      pieceLive = await pdpVerifier.pieceLive(dataSetId, pieceId)
      if (pieceLive) break

      console.log('Piece %s is not live, trying an older file', pieceId)
      remainingAttempts--
      pieceId--
    }

    if (!pieceLive) {
      console.log('No more attempts left, restarting the sampling algorithm')
      continue
    }

    console.log('Picked piece id:', pieceId)

    const [pieceCidRaw] = await pdpVerifier.getPieceCid(dataSetId, pieceId)
    console.log('Found CommP:', pieceCidRaw)
    const cidBytes = Buffer.from(pieceCidRaw.slice(2), 'hex')
    const pieceCidObj = CID.decode(cidBytes)
    console.log('Converted to CommP CID:', pieceCidObj)
    const pieceCid = pieceCidObj.toString()

    if (IGNORED_PIECES.includes(`${dataSetId}:${pieceCid}`)) {
      console.log(
        'We are ignoring this piece, restarting the sampling algorithm',
      )
      continue
    }

    return { pieceCid, dataSetId, pieceId, clientAddress }
  }
}

/**
 * @param {object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {FilecoinWarmStorageService} args.filecoinWarmStorageService
 * @param {ServiceProviderRegistry} args.serviceProviderRegistry
 * @param {string} [args.botLocation] Fly region where the bot is running
 * @param {string} args.CDN_HOSTNAME
 * @param {BigInt} args.FROM_DATA_SET_ID
 */

export async function testLatestRetrievablePiece({
  pdpVerifier,
  filecoinWarmStorageService,
  serviceProviderRegistry,
  botLocation,
  CDN_HOSTNAME,
  FROM_DATA_SET_ID,
}) {
  const { pieceCid, dataSetId, pieceId, clientAddress } =
    await getMostRecentFileWithCDN({
      pdpVerifier,
      filecoinWarmStorageService,
      serviceProviderRegistry,
      FROM_DATA_SET_ID,
    })

  await testRetrieval({
    pdpVerifier,
    filecoinWarmStorageService,
    serviceProviderRegistry,
    clientAddress,
    botLocation,
    CDN_HOSTNAME,
    pieceCid,
    dataSetId,
    pieceId,
  })
}

/**
 * @param {Object} args
 * @param {PdpVerifier} args.pdpVerifier
 * @param {FilecoinWarmStorageService} args.filecoinWarmStorageService
 * @param {ServiceProviderRegistry} args.serviceProviderRegistry
 * @param {BigInt} args.FROM_DATA_SET_ID
 * @returns {Promise<{
 *   pieceCid: string
 *   dataSetId: BigInt
 *   pieceId: BigInt
 *   clientAddress: string
 * }>}
 *   The CommP CID of the file.
 */
async function getMostRecentFileWithCDN({
  pdpVerifier,
  filecoinWarmStorageService,
  serviceProviderRegistry,
  FROM_DATA_SET_ID,
}) {
  for (
    let dataSetId = (await pdpVerifier.getNextDataSetId()) - 1n;
    dataSetId >= 0n && dataSetId >= FROM_DATA_SET_ID;
    dataSetId--
  ) {
    console.log('Checking data set ID:', dataSetId)

    const dataSetLive = await pdpVerifier.dataSetLive(dataSetId)
    if (!dataSetLive) {
      console.log('data set is not live')
      continue
    }

    const { payer: clientAddress, payee: providerAddress } =
      await filecoinWarmStorageService.getDataSet(dataSetId)
    const { exists: withCDNMetadaKeyExists, value: withCDNMetadataValue } =
      await filecoinWarmStorageService.getDataSetMetadata(dataSetId, 'withCDN')
    const withCDN = withCDNMetadaKeyExists && withCDNMetadataValue === 'true'

    if (!withCDN) {
      console.log('data set does not pay for CDN')
      continue
    }

    const providerId =
      await serviceProviderRegistry.addressToProviderId(providerAddress)
    const providerIsApproved =
      await filecoinWarmStorageService.approvedProviders(providerId)
    if (!providerIsApproved) {
      console.log('Provider is not approved, restarting the sampling algorithm')
      continue
    }

    const providerIsActive =
      await serviceProviderRegistry.isProviderActive(providerId)
    if (!providerIsActive) {
      console.log('Provider is not active, restarting the sampling algorithm')
      continue
    }

    console.log('dataset client:', clientAddress)

    // Pick the most recently uploaded file that wasn't deleted yet.

    for (
      let pieceId = (await pdpVerifier.getNextPieceId(dataSetId)) - 1n;
      pieceId >= 0n;
      pieceId--
    ) {
      console.log('Checking piece ID:', pieceId)
      const pieceIsLive = await pdpVerifier.pieceLive(dataSetId, pieceId)
      if (!pieceIsLive) {
        console.log('Piece is not live')
        continue
      }

      const [pieceCidRaw] = await pdpVerifier.getPieceCid(dataSetId, pieceId)
      console.log('Found CommP:', pieceCidRaw)
      const cidBytes = Buffer.from(pieceCidRaw.slice(2), 'hex')
      const pieceCidObj = CID.decode(cidBytes)
      console.log('Converted to CommP CID:', pieceCidObj)
      const pieceCid = pieceCidObj.toString()

      if (IGNORED_PIECES.includes(`${dataSetId}:${pieceCid}`)) {
        console.log('We are ignoring this piece')
        continue
      }

      return { pieceCid, dataSetId, pieceId, clientAddress }
    }
  }

  throw new Error('No suitable piece found')
}
