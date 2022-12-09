import { TezosToolkit } from "@taquito/taquito";
import { migrate } from "../scripts/helpers";
import factoryStorage from "../storage/factoryStorage";

module.exports = async (
  tezos: TezosToolkit,
  network: string,
): Promise<void> => {
  const sender = await tezos.signer.publicKeyHash();
  factoryStorage.owner = sender;
  const factory = await migrate(tezos, "factory", factoryStorage, network);

  console.log(`Dex factory deployed at: ${factory}`);
};
