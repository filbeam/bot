import { setTimeout } from 'node:timers/promises'
import { ethers } from 'ethers'
import { pdpVerifierAbi, sampleRetrieval } from '../index.js'

const {
  GLIF_TOKEN,
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PDP_VERIFIER_ADDRESS = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC',
  CDN_URL = 'https://0x000000000000000000000000000000000000dEaD.calibration.filcdn.io',
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

while (true) {
  await sampleRetrieval({
    pdpVerifier,
    CDN_URL,
    FROM_PROOFSET_ID: BigInt(FROM_PROOFSET_ID),
  })
  console.log('\n')
  await setTimeout(Number(DELAY))
}
