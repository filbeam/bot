import { ethers } from 'ethers'
import assert from 'node:assert'
import { pandoraServiceAbi } from './index.js'

const {
  GLIF_TOKEN,
  RPC_URL = 'https://api.calibration.node.glif.io/',
  PANDORA_SERVICE_ADDRESS = '0xf49ba5eaCdFD5EE3744efEdf413791935FE4D4c5',
} = process.env

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

const providers = await pandoraService.getAllApprovedProviders()

for (const providerInfo of providers) {
  console.log('%o', {
    owner: providerInfo.owner.toLowerCase(),
    pdpUrl: providerInfo.pdpUrl,
    pieceRetrievalUrl: providerInfo.pieceRetrievalUrl,
    registeredAt: providerInfo.registeredAt,
    approvedAt: providerInfo.approvedAt,
  })
}
