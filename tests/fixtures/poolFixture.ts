import { MichelsonMap, TezosToolkit, TransferParams } from "@taquito/taquito";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { CallMode } from "@madfish/quipuswap-v3/dist/types";
import { sendBatch } from "@madfish/quipuswap-v3/dist/utils";
import DexFactory from "./../helpers/factoryFacade";
import { fa12Storage } from "./../../storage/test/FA12";
import { fa2Storage } from "./../../storage/test/FA2";
import { FA2 } from "./../helpers/FA2";
import { FA12 } from "./../helpers/FA12";
import { confirmOperation } from "./../../scripts/confirmation";

import { BigNumber } from "bignumber.js";

export async function poolsFixture(
  tezos,
  signers: any[],
  fees: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0],
  tickSpacing: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1],
) {
  const fa12TokenX = await FA12.originate(tezos, fa12Storage);

  const fa12TokenY = await FA12.originate(tezos, fa12Storage);
  const fa2TokenX = await FA2.originate(tezos, fa2Storage);
  const fa2TokenY = await FA2.originate(tezos, fa2Storage);

  const factory = await new DexFactory(tezos, "development").initialize();
  const paramsList: TransferParams[] = [];
  let transferParams: TransferParams = await factory.deployPool(
    fa12TokenX.contract.address,
    "fa12",
    fa12TokenY.contract.address,
    "fa12",
    fees[0],
    tickSpacing[0],
    MichelsonMap.fromLiteral({}),
    0,
    0,
    true,
  );
  paramsList.push(transferParams);

  transferParams = await factory.deployPool(
    fa2TokenX.contract.address,
    "fa2",
    fa2TokenY.contract.address,
    "fa2",
    fees[1],
    tickSpacing[1],
    MichelsonMap.fromLiteral({}),
    0,
    0,
    true,
  );
  paramsList.push(transferParams);

  transferParams = await factory.deployPool(
    fa12TokenX.contract.address,
    "fa12",
    fa2TokenY.contract.address,
    "fa2",
    fees[2],
    tickSpacing[2],
    MichelsonMap.fromLiteral({}),
    0,
    0,
    true,
  );
  paramsList.push(transferParams);

  transferParams = await factory.deployPool(
    fa2TokenX.contract.address,
    "fa2",
    fa12TokenY.contract.address,
    "fa12",
    fees[3],
    tickSpacing[3],
    MichelsonMap.fromLiteral({}),
    0,
    0,
    true,
  );
  paramsList.push(transferParams);

  const operation = await sendBatch(tezos, paramsList);

  await confirmOperation(tezos, operation.opHash);

  const pools = await factory.getPools([0, 1, 2, 3]);

  const poolFa12 = await new QuipuswapV3().init(tezos, pools[0]);
  const poolFa2 = await new QuipuswapV3().init(tezos, pools[1]);
  const poolFa1_2 = await new QuipuswapV3().init(tezos, pools[2]);
  const poolFa2_1 = await new QuipuswapV3().init(tezos, pools[3]);

  // update operators
  for (let i = 0; i < signers.length; i++) {
    const approvesParamsList: TransferParams[] = [];
    tezos.setSignerProvider(signers[i]);
    await fa12TokenX.approve(poolFa12.contract.address, new BigNumber(1e18));
    await fa12TokenY.approve(poolFa12.contract.address, new BigNumber(1e18));
    const signerAddress = await signers[i].publicKeyHash();

    let transferParams = await fa2TokenX.updateOperators(
      [
        {
          add_operator: {
            owner: signerAddress,
            operator: poolFa2.contract.address,
            token_id: new BigNumber(0),
          },
        },
      ],
      true,
    );

    approvesParamsList.push(transferParams as TransferParams);
    transferParams = await fa2TokenY.updateOperators(
      [
        {
          add_operator: {
            owner: signerAddress,
            operator: poolFa2.contract.address,
            token_id: new BigNumber(0),
          },
        },
      ],
      true,
    );

    approvesParamsList.push(transferParams as TransferParams);
    transferParams = await fa12TokenX.approve(
      poolFa1_2.contract.address,
      new BigNumber(1e18),
      true,
    );

    approvesParamsList.push(transferParams as TransferParams);
    transferParams = await fa2TokenY.updateOperators(
      [
        {
          add_operator: {
            owner: signerAddress,
            operator: poolFa1_2.contract.address,
            token_id: new BigNumber(0),
          },
        },
      ],
      true,
    );

    approvesParamsList.push(transferParams as TransferParams);
    transferParams = await fa2TokenX.updateOperators(
      [
        {
          add_operator: {
            owner: signerAddress,
            operator: poolFa2_1.contract.address,
            token_id: new BigNumber(0),
          },
        },
      ],
      true,
    );

    approvesParamsList.push(transferParams as TransferParams);
    transferParams = await fa12TokenY.approve(
      poolFa2_1.contract.address,
      new BigNumber(1e18),
      true,
    );

    approvesParamsList.push(transferParams as TransferParams);
    const approvesOperation = await sendBatch(tezos, approvesParamsList);
    await confirmOperation(tezos, approvesOperation.opHash);
  }

  return {
    factory,
    fa12TokenX,
    fa12TokenY,
    fa2TokenX,
    fa2TokenY,
    poolFa12,
    poolFa2,
    poolFa1_2,
    poolFa2_1,
  };
}
