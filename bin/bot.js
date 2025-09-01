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
  PDP_VERIFIER_PROXY_ADDRESS = '0xf9f521c6e11A1680ead3eDD8a2757Ea731458617',
  // TODO: replace with the actual address
  FILECOIN_WARM_STORAGE_SERVICE_STATE_VIEW_ADDRESS = '0x',
  SERVICE_PROVIDER_REGISTRY_ADDRESS = '0x',
  CDN_HOSTNAME = 'calibration.filcdn.io',
  DELAY = 1_000,
  FROM_DATASET_ID = 0,
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
  new ethers.Contract(PDP_VERIFIER_PROXY_ADDRESS, pdpVerifierAbi, provider)
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
        FROM_DATASET_ID: BigInt(FROM_DATASET_ID),
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
        FROM_DATASET_ID: BigInt(FROM_DATASET_ID),
      })
      console.log('\n')
      await setTimeout(Number(30_000)) // block time
    }
  })(),
])
