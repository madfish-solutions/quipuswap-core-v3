import { TezosToolkit } from "@taquito/taquito";
import { migrate } from "../scripts/helpers";
import { factoryStorage } from "../storage/factoryStorage";

module.exports = async (
  tezos: TezosToolkit,
  network: string,
): Promise<void> => {
  const factory = await migrate(tezos, "factory", factoryStorage, network);

  console.log(`Dex factory deployed at: ${factory}`);
};
