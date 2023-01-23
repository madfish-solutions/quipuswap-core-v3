import { TezosToolkit } from "@taquito/taquito";

import { confirmOperation } from "./../scripts/confirmation";
const env = require("./../env");
const networks = env.default.networks;

module.exports = async (tezos: TezosToolkit, network: string) => {
  const dexFactory: string = require("./../build/factory.json").networks[
    network
  ]["factory"];

  const factory = (await tezos.contract.at(dexFactory)) as any;

  for (const pool of Object.values(networks[network].pools) as unknown as any) {
    pool as any;
    const poolName = pool.name;
    const lastPoolId = await factory
      .storage()
      .then(storage => storage.pool_count);

    const operation = await factory.methodsObject
      .deploy_pool({
        cur_tick_index: pool.tickIndex,
        token_x: pool.tokenX,
        token_y: pool.tokenY,
        fee_bps: pool.feeBPS,
        tick_spacing: "1",
        extra_slots: pool.extraSlots,
        metadata: pool.metadata,
      })
      .send();
    await confirmOperation(tezos, operation.hash);
    const poolAddress = await factory
      .storage()
      .then(storage => storage.pools.get(lastPoolId));

    console.log(`Pool ${poolName} deployed at: ${poolAddress}`);
  }
};
