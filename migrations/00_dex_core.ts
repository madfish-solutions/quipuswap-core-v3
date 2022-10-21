import { TezosToolkit } from "@taquito/taquito";

const { MichelsonMap } = require("@taquito/michelson-encoder");
const { migrate } = require("../scripts/helpers");

import { dexStorage } from "../storage/dexStorage";

module.exports = async (tezos: TezosToolkit, network: string) => {
  const sender = await tezos.signer.publicKeyHash();

  const factory = await migrate(tezos, "dex_core", dexStorage, network);

  console.log(`Quipuswap Dex V3 deployed at: ${factory}`);
};
