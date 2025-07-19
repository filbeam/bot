import { setTimeout } from 'node:timers/promises'
import { ethers } from 'ethers'
import {
  pandoraServiceAbi,
  pdpVerifierAbi,
  sampleRetrieval,
  testLatestRetrievableRoot,
} from '../index.js'

const {
  GLIF_TOKEN,
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PDP_VERIFIER_ADDRESS = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC',
  PANDORA_SERVICE_ADDRESS = '0xf49ba5eaCdFD5EE3744efEdf413791935FE4D4c5',
  CDN_HOSTNAME = 'calibration.filcdn.io',
  DELAY = 1_000,
  FROM_PROOFSET_ID = 200,
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

/** @type {import('../index.js').PandoraService} */
const pandoraService = /** @type {any} */ (
  new ethers.Contract(PANDORA_SERVICE_ADDRESS, pandoraServiceAbi, provider)
)

await Promise.all([
  (async () => {
    while (true) {
      await sampleRetrieval({
        pdpVerifier,
        pandoraService,
        CDN_HOSTNAME,
        FROM_PROOFSET_ID: BigInt(FROM_PROOFSET_ID),
      })
      console.log('\n')
      await setTimeout(Number(DELAY))
    }
  })(),
  (async () => {
    while (true) {
      await testLatestRetrievableRoot({
        pdpVerifier,
        pandoraService,
        CDN_HOSTNAME,
      })
      console.log('\n')
      await setTimeout(Number(30_000)) // block time
    }
  })(),
])
