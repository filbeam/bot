import { ethers } from 'ethers'
import assert from 'node:assert'
import { pandoraServiceAbi } from './index.js'

const {
  GLIF_TOKEN,
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PANDORA_SERVICE_ADDRESS = '0xf49ba5eaCdFD5EE3744efEdf413791935FE4D4c5',
} = process.env

const [proofSetIdString] = process.argv.slice(2)
assert(proofSetIdString, 'Proof Set ID is required as the first argument')
const proofSetId = BigInt(proofSetIdString)

const fetchRequest = new ethers.FetchRequest(RPC_URL)
if (GLIF_TOKEN) {
  fetchRequest.setHeader('Authorization', `Bearer ${GLIF_TOKEN}`)
}
const provider = new ethers.JsonRpcProvider(fetchRequest, undefined, {
  polling: true,
})

/** @type {import('../index.js').PandoraService} */
const pandoraService = /** @type {any} */ (
  new ethers.Contract(PANDORA_SERVICE_ADDRESS, pandoraServiceAbi, provider)
)

const proofSetInfo = await pandoraService.getProofSet(proofSetId)
console.log('PROOF SET PANDORA INFO: %o', {
  railId: proofSetInfo.railId,
  payer: proofSetInfo.payer,
  payee: proofSetInfo.payee,
  commissionBps: proofSetInfo.commissionBps,
  metadata: proofSetInfo.metadata,
  // rootMetadata: proofSetInfo.rootMetadata,
  clientDataSetId: proofSetInfo.clientDataSetId,
  withCDN: proofSetInfo.withCDN,
})

const owner = proofSetInfo.payee
console.log('OWNER ADDRESS: %s', owner)
const providerId = await pandoraService.getProviderIdByAddress(owner)
const providerInfo = await pandoraService.getApprovedProvider(providerId)

console.log('PANDORA APPROVED PROVIDER INFO: %o', {
  owner: providerInfo.owner,
  pdpUrl: providerInfo.pdpUrl,
  pieceRetrievalUrl: providerInfo.pieceRetrievalUrl,
  registeredAt: providerInfo.registeredAt,
  approvedAt: providerInfo.approvedAt,
})
