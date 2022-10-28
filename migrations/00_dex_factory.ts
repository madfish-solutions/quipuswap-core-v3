import { TezosToolkit } from "@taquito/taquito";
import { MichelsonMap } from "@taquito/michelson-encoder";
import { migrate } from "../scripts/helpers";
import { factoryStorage } from "../storage/factoryStorage";
const { networks } = require("../env");

module.exports = async (
  tezos: TezosToolkit,
  network: string,
): Promise<void> => {
  // const networkSettings = networks[network];
  // const sender = await tezos.signer.publicKeyHash();

  const factory = await migrate(tezos, "factory", factoryStorage, network);

  console.log(`Dex factory deployed at: ${factory}`);
};
