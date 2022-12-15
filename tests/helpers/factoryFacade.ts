import { Contract, MichelsonMap, TezosToolkit } from "@taquito/taquito";
import { migrate } from "./../../scripts/helpers";

import factoryStorage from "./../../storage/factoryStorage";
import { confirmOperation } from "./../../scripts/confirmation";
import { BytesLiteral } from "@taquito/michel-codec";
import { MichelsonMapKey } from "@taquito/michelson-encoder";

export default class Factory {
  contract: Contract;
  constructor(private tezos: TezosToolkit, private network: string) {}

  async initialize(factoryAddress?: string) {
    if (factoryAddress) {
      this.contract = await this.tezos.contract.at(factoryAddress);
    } else {
      const deployedAddress = await migrate(
        this.tezos,
        "factory",
        factoryStorage,
        this.network,
      );
      this.contract = await this.tezos.contract.at(deployedAddress!);
    }
    return this;
  }
  async deployPool(
    xTokenAddress: string,
    xTokenType: string,
    yTokenAddress: string,
    yTokenType: string,
    feeBPS: number,
    tickSpacing: number,
    metadata: MichelsonMap<MichelsonMapKey, unknown>,
    xTokenId: number = 0,
    yTokenId: number = 0,
    returnParams: boolean = false,
  ) {
    let op;
    if (returnParams) {
      if (xTokenType === "fa2" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .toTransferParams();
      } else if (xTokenType === "fa2" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .toTransferParams();
      } else if (xTokenType === "fa12" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .toTransferParams();
      } else if (xTokenType === "fa12" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .toTransferParams();
      }
      return op;
    } else {
      if (xTokenType === "fa2" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .send();
      } else if (xTokenType === "fa2" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenId,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .send();
      } else if (xTokenType === "fa12" && yTokenType === "fa2") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenId,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .send();
      } else if (xTokenType === "fa12" && yTokenType === "fa12") {
        op = await this.contract.methods
          .deploy_pool(
            xTokenType,
            xTokenAddress,
            yTokenType,
            yTokenAddress,
            feeBPS,
            tickSpacing,
            metadata,
          )
          .send();
      }
      await confirmOperation(this.tezos, op.hash);
      const storage = (await this.contract.storage()) as any;
      return await storage.pools.get(
        (storage.pool_count.toString() - 1).toString(),
      );
    }
  }
  async getPools(ids: number[]) {
    const storage = (await this.contract.storage()) as any;
    const pools = await Promise.all(
      ids.map(async id => {
        try {
          await storage.pools.get(id.toString());
          return await storage.pools.get(id.toString());
        } catch (e) {
          return null;
        }
      }),
    );
    return pools;
  }
}
