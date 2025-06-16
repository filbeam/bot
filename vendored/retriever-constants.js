// A copy of https://github.com/filcdn/worker/blob/main/retriever/lib/constants.js

// Hardcoded base URL for the file retrieval with sample root CIDs
/**
 * @type {Record<
 *   string,
 *   { url: string; sample: { rootCid: string; proofSetId: number } }
 * >}
 */
export const OWNER_TO_RETRIEVAL_URL_MAPPING = {
  '0x12191de399b9b3ffeb562861f9ed62ea8da18ae5': {
    url: 'https://techx-pdp.filecoin.no',
    sample: {
      rootCid:
        'baga6ea4seaqmqjamoiors6rjncefkohlqd2yw7k5ockt2u5fkr6d6rcwpfp5ejq',
      proofSetId: 239,
    },
  },
  '0x2a06d234246ed18b6c91de8349ff34c22c7268e8': {
    url: 'https://pdp.660688.xyz:8443',
    sample: {
      rootCid:
        'baga6ea4seaqaleibb6ud4xeemuzzpsyhl6cxlsymsnfco4cdjka5uzajo2x4ipi',
      proofSetId: 238,
    },
  },
  '0x9f5087a1821eb3ed8a137be368e5e451166efaae': {
    url: 'https://yablu.net',
    sample: {
      rootCid:
        'baga6ea4seaqpwnxh6pgese5zizjv7rx3s755ux2yebo6fdba7j4gjhshbj3uqoa',
      proofSetId: 233,
    },
  },
  '0xcb9e86945ca31e6c3120725bf0385cbad684040c': {
    url: 'https://caliberation-pdp.infrafolio.com',
    sample: {
      rootCid:
        'baga6ea4seaqntcagzjqzor3qxjba2mybegc6d2jxiewxinkd72ecll6xqicqcfa',
      proofSetId: 234,
    },
  },
  '0xe9bc394383b67abcebe86fd9843f53d8b4a2e981': {
    url: 'https://polynomial.computer',
    sample: {
      rootCid:
        'baga6ea4seaqd54v34enrzo4lt46mlxiamghemq7zo2piyqhpqh6yvlkipxvaopy',
      proofSetId: 237,
    },
  },
  // TODO: Add entry for 0x4A628ebAecc32B8779A934ebcEffF1646F517756
}
