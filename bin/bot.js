import { setTimeout } from 'node:timers/promises'
import { ethers } from 'ethers'
import {
  filecoinWarmStorageServiceStateViewStateViewAbi,
  serviceProviderRegistryAbi,
  pdpVerifierAbi,
  sampleRetrieval,
  testLatestRetrievablePiece,
} from '../index.js'

const {
  FLY_REGION,
  GLIF_TOKEN,
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PDP_VERIFIER_ADDRESS = '0x445238Eca6c6aB8Dff1Aa6087d9c05734D22f137',
  FILECOIN_WARM_STORAGE_SERVICE_STATE_VIEW_ADDRESS = '0x87EDE87cEF4BfeFE0374c3470cB3F5be18b739d5',
  SERVICE_PROVIDER_REGISTRY_ADDRESS = '0xA8a7e2130C27e4f39D1aEBb3D538D5937bCf8ddb',
  CDN_HOSTNAME = 'calibration.filcdn.io',
  DELAY = 1_000,
  FROM_DATA_SET_ID = 0,
} = process.env

const fetchRequest = new ethers.FetchRequest(RPC_URL)
if (GLIF_TOKEN) {
  fetchRequest.setHeader('Authorization', `Bearer ${GLIF_TOKEN}`)
}
const provider = new ethers.JsonRpcProvider(fetchRequest, undefined, {
  polling: true,
})

/** @type {import('../index.js').PdpVerifier} */
const pdpVerifier = /** @type {any} */ (
  new ethers.Contract(PDP_VERIFIER_ADDRESS, pdpVerifierAbi, provider)
)

/** @type {import('../index.js').FilecoinWarmStorageServiceStateView} */
const filecoinWarmStorageServiceStateView = /** @type {any} */ (
  new ethers.Contract(
    FILECOIN_WARM_STORAGE_SERVICE_STATE_VIEW_ADDRESS,
    filecoinWarmStorageServiceStateViewStateViewAbi,
    provider,
  )
)

/** @type {import('../index.js').ServiceProviderRegistry} */
const serviceProviderRegistry = /** @type {any} */ (
  new ethers.Contract(
    SERVICE_PROVIDER_REGISTRY_ADDRESS,
    serviceProviderRegistryAbi,
    provider,
  )
)

await Promise.all([
  (async () => {
    while (true) {
      await sampleRetrieval({
        pdpVerifier,
        filecoinWarmStorageServiceStateView,
        serviceProviderRegistry,
        botLocation: FLY_REGION,
        CDN_HOSTNAME,
        FROM_DATA_SET_ID: BigInt(FROM_DATA_SET_ID),
      })
      console.log('\n')
      await setTimeout(Number(DELAY))
    }
  })(),
  (async () => {
    while (true) {
      await testLatestRetrievablePiece({
        pdpVerifier,
        filecoinWarmStorageServiceStateView,
        serviceProviderRegistry,
        botLocation: FLY_REGION,
        CDN_HOSTNAME,
        FROM_DATA_SET_ID: BigInt(FROM_DATA_SET_ID),
      })
      console.log('\n')
      await setTimeout(Number(30_000)) // block time
    }
  })(),
])
