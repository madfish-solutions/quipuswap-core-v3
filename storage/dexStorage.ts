import { MichelsonMap } from "@taquito/michelson-encoder";

import { quipuswapV3Types as qsTypes } from "../types/DexCore";
import BigNumber from "bignumber.js";

const cumulativesBuffer: qsTypes.TimedCumulativesBuffer = {
  map: MichelsonMap.fromLiteral({}),
  first: new BigNumber(0),
  last: new BigNumber(0),
  reserved_length: new BigNumber(0),
};

const constants: qsTypes.Constants = {
  fee_bps: new BigNumber(0),
  ctez_burn_fee_bps: new BigNumber(0),
  x_token_id: new BigNumber(0),
  y_token_id: new BigNumber(0),
  x_token_address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
  y_token_address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
  tick_spacing: new BigNumber(0),
};

const balanceNatX128 = {
  x: BigNumber(0) as unknown as qsTypes.x128n,
  y: BigNumber(0) as unknown as qsTypes.x128n,
} as qsTypes.BalanceNatX128;

export const dexStorage: qsTypes.Storage = {
  liquidity: new BigNumber(0),
  sqrt_price: new BigNumber(0),
  cur_tick_index: new BigNumber(0),
  cur_tick_witness: BigNumber(0),
  fee_growth: balanceNatX128,
  ticks: MichelsonMap.fromLiteral({}),
  positions: MichelsonMap.fromLiteral({}),
  cumulatives_buffer: cumulativesBuffer,
  metadata: MichelsonMap.fromLiteral({}),
  new_position_id: new BigNumber(0),
  operators: MichelsonMap.fromLiteral({}),
  constants: constants,
  ladder: MichelsonMap.fromLiteral({}),
};
