import { MichelsonMap } from "@taquito/michelson-encoder";

import { BigNumber } from "bignumber.js";

import { fa2Types } from "@madfish/quipuswap-v3/dist/types";

import { accounts } from "./../../sandbox/accounts";

const totalSupply: BigNumber = new BigNumber(1e12);

export const fa2Storage: fa2Types.FA2Storage = {
  account_info: MichelsonMap.fromLiteral({
    [accounts.alice.pkh]: {
      balances: MichelsonMap.fromLiteral({
        [0]: totalSupply.dividedBy(4).integerValue(BigNumber.ROUND_DOWN),
      }),
      allowances: [],
    },
    [accounts.bob.pkh]: {
      balances: MichelsonMap.fromLiteral({
        [0]: totalSupply.dividedBy(4).integerValue(BigNumber.ROUND_DOWN),
      }),
      allowances: [],
    },
    [accounts.peter.pkh]: {
      balances: MichelsonMap.fromLiteral({
        [0]: totalSupply.dividedBy(4).integerValue(BigNumber.ROUND_DOWN),
      }),
      allowances: [],
    },
    [accounts.eve.pkh]: {
      balances: MichelsonMap.fromLiteral({
        [0]: totalSupply.dividedBy(4).integerValue(BigNumber.ROUND_DOWN),
      }),
      allowances: [],
    },
  }),
  token_info: MichelsonMap.fromLiteral({}),
  metadata: MichelsonMap.fromLiteral({}),
  token_metadata: MichelsonMap.fromLiteral({}),
  minters_info: MichelsonMap.fromLiteral({}),
  last_token_id: new BigNumber(1),
  admin: accounts.alice.pkh,
  permit_counter: new BigNumber(0),
  permits: MichelsonMap.fromLiteral({}),
  default_expiry: new BigNumber(1000),
  total_minter_shares: new BigNumber(0),
};
