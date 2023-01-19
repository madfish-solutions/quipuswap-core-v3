import { MichelsonMap, TezosToolkit, TransferParams } from "@taquito/taquito";
import { QuipuswapV3 } from "@madfish/quipuswap-v3";
import { sendBatch } from "@madfish/quipuswap-v3/dist/utils";
import DexFactory from "./../helpers/factoryFacade";
import { fa12Storage } from "./../../storage/test/FA12";
import { fa2Storage } from "./../../storage/test/FA2";
import { FA2 } from "./../helpers/FA2";
import { FA12 } from "./../helpers/FA12";
import { confirmOperation } from "./../../scripts/confirmation";

import { BigNumber } from "bignumber.js";
import { migrate } from "../../scripts/helpers";

const getTypedUpdateOperator = async (
  tezos: TezosToolkit,
  token: any,
  owner: string,
  operator: string,
  amount: BigNumber = new BigNumber(0),
  returnTransferParams: boolean = false,
) => {
  const tokenType = token instanceof FA12 ? "fa12" : "fa2";
  if (tokenType === "fa12") {
    if (returnTransferParams) {
      return token.approve(operator, new BigNumber(amount), true);
    }
    return token.approve(operator, new BigNumber(amount));
  } else {
    if (returnTransferParams) {
      return token.updateOperators(
        [
          {
            add_operator: {
              owner: owner,
              operator: operator,
              token_id: new BigNumber(0),
            },
          },
        ],
        true,
      );
    }
    return await token.updateOperators([
      {
        add_operator: {
          owner: owner,
          operator: operator,
          token_id: new BigNumber(0),
        },
      },
    ]);
  }
};

export async function poolsFixture(
  tezos,
  signers: any[],
  extraSlots: number = 0,
  fees: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dublicate: boolean = false,
  devFee: number = 0,
  tickSpacing: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1],
) {
  const fa12TokenX = await FA12.originate(tezos, fa12Storage);

  const fa12TokenY = await FA12.originate(tezos, fa12Storage);
  const fa2TokenX = await FA2.originate(tezos, fa2Storage);
  const fa2TokenY = await FA2.originate(tezos, fa2Storage);

  const factory = await new DexFactory(tezos, "development").initialize(devFee);
  let factory2;
  let poolList: any[] = [
    [fa12TokenX, fa12TokenY],
    [fa2TokenX, fa2TokenY],
    [fa12TokenX, fa2TokenY],
    [fa2TokenX, fa12TokenY],
  ];
  if (dublicate) {
    factory2 = await new DexFactory(tezos, "development").initialize(devFee);
    const paramsList: TransferParams[] = [];
    for (const pair of poolList) {
      const xToken = pair[0];
      const yToken = pair[1];
      const xTokenType = xToken instanceof FA12 ? "fa12" : "fa2";
      const yTokenType = yToken instanceof FA12 ? "fa12" : "fa2";

      const transferParams: TransferParams = await factory2.deployPool(
        xToken.contract.address,
        xTokenType,
        yToken.contract.address,
        yTokenType,
        fees[paramsList.length],
        tickSpacing[0],
        extraSlots,
        MichelsonMap.fromLiteral({}),
        0,
        0,
        true,
      );
      paramsList.push(transferParams);
    }
    const operation = await sendBatch(tezos, paramsList);

    await confirmOperation(tezos, operation.opHash);
  }
  const paramsList: TransferParams[] = [];
  for (const pair of poolList) {
    const xToken = pair[0];
    const yToken = pair[1];
    const xTokenType = xToken instanceof FA12 ? "fa12" : "fa2";
    const yTokenType = yToken instanceof FA12 ? "fa12" : "fa2";

    const transferParams: TransferParams = await factory.deployPool(
      xToken.contract.address,
      xTokenType,
      yToken.contract.address,
      yTokenType,
      fees[paramsList.length],
      tickSpacing[0],
      extraSlots,
      MichelsonMap.fromLiteral({}),
      0,
      0,
      true,
    );
    paramsList.push(transferParams);
  }

  const operation = await sendBatch(tezos, paramsList);

  await confirmOperation(tezos, operation.opHash);

  const pools = await factory.getPools([0, 1, 2, 3, 4]);
  const poolFa12 = await new QuipuswapV3().init(tezos, pools[0]);
  const poolFa2 = await new QuipuswapV3().init(tezos, pools[1]);
  const poolFa1_2 = await new QuipuswapV3().init(tezos, pools[2]);
  const poolFa2_1 = await new QuipuswapV3().init(tezos, pools[3]);

  let deployedPoolList = [poolFa12, poolFa2, poolFa1_2, poolFa2_1];
  let poolFa12Dublicate;
  let poolFa2Dublicate;
  let poolFa1_2Dublicate;
  let poolFa2_1Dublicate;
  if (dublicate) {
    const pools2 = await factory2.getPools([0, 1, 2, 3, 4]);
    poolFa12Dublicate = await new QuipuswapV3().init(tezos, pools2[0]);
    poolFa2Dublicate = await new QuipuswapV3().init(tezos, pools2[1]);
    poolFa1_2Dublicate = await new QuipuswapV3().init(tezos, pools2[2]);
    poolFa2_1Dublicate = await new QuipuswapV3().init(tezos, pools2[3]);
    deployedPoolList = deployedPoolList.concat([
      poolFa12Dublicate,
      poolFa2Dublicate,
      poolFa1_2Dublicate,
      poolFa2_1Dublicate,
    ]);
  }
  const deployedConsumer = await migrate(
    tezos,
    "consumer",
    { snapshot_id: 0, snapshots: MichelsonMap.fromLiteral({}) },
    "development",
  );
  const consumer = await tezos.contract.at(deployedConsumer!);
  // update operators
  for (let i = 0; i < signers.length; i++) {
    const approvesParamsList: TransferParams[] = [];
    tezos.setSignerProvider(signers[i]);
    const signerAddress = await signers[i].publicKeyHash();
    for (const pool of deployedPoolList) {
      const poolStorage: any = await pool.contract.storage();

      const tokenXType = Object.keys(poolStorage.constants.token_x)[0];
      const tokenYType = Object.keys(poolStorage.constants.token_y)[0];
      const xToken = tokenXType === "fa12" ? fa12TokenX : fa2TokenX;
      const yToken = tokenYType === "fa12" ? fa12TokenY : fa2TokenY;

      approvesParamsList.push(
        await getTypedUpdateOperator(
          tezos,
          xToken,
          signerAddress,
          pool.contract.address,
          new BigNumber(1e18),
          true,
        ),
      );

      approvesParamsList.push(
        await getTypedUpdateOperator(
          tezos,
          yToken,
          signerAddress,
          pool.contract.address,
          new BigNumber(1e18),
          true,
        ),
      );
    }

    if (dublicate) {
      const part1 = approvesParamsList.slice(0, 8);
      let approvesOperation = await sendBatch(tezos, part1);
      await confirmOperation(tezos, approvesOperation.opHash);

      const part2 = approvesParamsList.slice(8, 17);

      approvesOperation = await sendBatch(tezos, part2);
      await confirmOperation(tezos, approvesOperation.opHash);
    } else {
      const approvesOperation = await sendBatch(tezos, approvesParamsList);

      await confirmOperation(tezos, approvesOperation.opHash);
    }
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
    poolFa12Dublicate,
    poolFa2Dublicate,
    poolFa1_2Dublicate,
    poolFa2_1Dublicate,
    consumer,
  };
}
