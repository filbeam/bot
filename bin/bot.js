import { setTimeout } from 'node:timers/promises'
import { ethers } from 'ethers'
import {
  fwssStateViewAbi,
  serviceProviderRegistryAbi,
  pdpVerifierAbi,
  sampleRetrieval,
  testLatestRetrievablePiece,
} from '../index.js'

const {
  FLY_REGION,
  GLIF_TOKEN,
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PDP_VERIFIER_ADDRESS = '0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C',
  FWSS_STATE_VIEW_ADDRESS = '0xA5D87b04086B1d591026cCE10255351B5AA4689B',
  SERVICE_PROVIDER_REGISTRY_ADDRESS = '0x839e5c9988e4e9977d40708d0094103c0839Ac9D',
  CDN_HOSTNAME = 'calibration.filbeam.io',
  DELAY = 1_000,
  FROM_DATA_SET_ID = 0,
  AUTH_TOKEN,
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
const fwssStateView = /** @type {any} */ (
  new ethers.Contract(FWSS_STATE_VIEW_ADDRESS, fwssStateViewAbi, provider)
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
        fwssStateView,
        serviceProviderRegistry,
        botLocation: FLY_REGION,
        CDN_HOSTNAME,
        FROM_DATA_SET_ID: BigInt(FROM_DATA_SET_ID),
        AUTH_TOKEN,
      })
      console.log('\n')
      await setTimeout(Number(DELAY))
    }
  })(),
  (async () => {
    while (true) {
      await testLatestRetrievablePiece({
        pdpVerifier,
        fwssStateView,
        serviceProviderRegistry,
        botLocation: FLY_REGION,
        CDN_HOSTNAME,
        FROM_DATA_SET_ID: BigInt(FROM_DATA_SET_ID),
        AUTH_TOKEN,
      })
      console.log('\n')
      await setTimeout(Number(30_000)) // block time
    }
  })(),
])
