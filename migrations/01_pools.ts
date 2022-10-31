import { TezosToolkit } from "@taquito/taquito";

import { confirmOperation } from "../scripts/confirmation";
const networks = require("../env").networks;

module.exports = async (tezos: TezosToolkit, network: string) => {
  const dexFactory: string = require("../build/factory.json").networks[network][
    "factory"
  ];

  const factory = (await tezos.contract.at(dexFactory)) as any;

  for (const pool of Object.values(networks[network].pools) as unknown as any) {
    pool as any;
    const lastPoolId = await factory
      .storage()
      .then(storage => storage.pool_count);

    const operation = await factory.methodsObject
      .deploy_pool({
        x_token_id: pool.tokenX.token_id,
        x_token_address: pool.tokenX.token_address,
        y_token_id: pool.tokenY.token_id,
        y_token_address: pool.tokenY.token_address,
        fee_bps: pool.feeBPS,
        metadata: pool.metadata,
      })
      .send();
    await confirmOperation(tezos, operation.hash);
    const poolAddress = await factory
      .storage()
      .then(storage => storage.pools.get(lastPoolId));

    console.log(`New pool deployed at: ${poolAddress}`);
  }
};
