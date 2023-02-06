import { TezosToolkit } from "@taquito/taquito";
import { migrate } from "../scripts/helpers";
import factoryStorage from "../storage/factoryStorage";
const env = require("./../env");
const networks = env.default.networks;

module.exports = async (
  tezos: TezosToolkit,
  network: string,
): Promise<void> => {
  factoryStorage.owner = networks[network].factoryOwner;
  const factory = await migrate(tezos, "factory", factoryStorage, network);

  console.log(`Dex factory deployed at: ${factory}`);
};
