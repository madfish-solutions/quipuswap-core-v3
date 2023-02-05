import {
  OriginationOperation,
  TransactionOperation,
  TezosToolkit,
  Contract,
} from "@taquito/taquito";

import fs from "fs";

import { BigNumber } from "bignumber.js";

import { confirmOperation } from "./../../scripts/confirmation";

import { fa2Types } from "@madfish/quipuswap-v3/dist/types";

export class FA2 {
  storage: fa2Types.FA2Storage;
  tezos: TezosToolkit;
  contract: Contract;

  constructor(contract: Contract, tezos: TezosToolkit) {
    this.contract = contract;
    this.tezos = tezos;
  }

  static async init(fa2Address: string, tezos: TezosToolkit): Promise<FA2> {
    return new FA2(await tezos.contract.at(fa2Address), tezos);
  }

  static async originate(
    tezos: TezosToolkit,
    storage: fa2Types.FA2Storage,
  ): Promise<FA2> {
    const artifacts: any = JSON.parse(
      fs.readFileSync(`tests/contracts/fa2.json`).toString(),
    );
    const operation: any = await tezos.contract
      .originate({
        code: artifacts.michelson,
        storage: storage,
      })
      .catch(e => {
        console.error(e);

        return null;
      });

    await confirmOperation(tezos, operation.hash);

    return new FA2(await tezos.contract.at(operation.contractAddress), tezos);
  }

  async updateStorage(maps = {}): Promise<void> {
    const storage: fa2Types.FA2Storage = await this.contract.storage();

    this.storage = storage;

    for (const key in maps) {
      this.storage[key] = await maps[key].reduce(
        async (prev: any, current: any) => {
          try {
            return {
              ...(await prev),
              [current]: await storage[key].get(current),
            };
          } catch (ex) {
            return {
              ...(await prev),
              [current]: 0,
            };
          }
        },
        Promise.resolve({}),
      );
    }
  }

  async transfer(params: fa2Types.Transfer[]): Promise<TransactionOperation> {
    const operation: TransactionOperation = await this.contract.methods
      .transfer(params)
      .send();

    await confirmOperation(this.tezos, operation.hash);

    return operation;
  }

  async updateOperators(
    updateOperatorsParams: fa2Types.UpdateOperators[],
    returnTransferParams: boolean = false,
  ) {
    if (returnTransferParams) {
      return this.contract.methods
        .update_operators(updateOperatorsParams)
        .toTransferParams();
    } else {
      const operation: TransactionOperation = await this.contract.methods
        .update_operators(updateOperatorsParams)
        .send();

      await confirmOperation(this.tezos, operation.hash);

      return operation;
    }
  }

  async getBalance(
    user: string,
    tokenId: BigNumber = new BigNumber(0),
  ): Promise<BigNumber> {
    const storage = (await this.contract.storage()) as any;
    try {
      const account = await storage.account_info.get(user);
      const balance = await account.balances.get(tokenId.toString());
      return balance;
    } catch (ex) {
      return new BigNumber(0);
    }
  }
}
