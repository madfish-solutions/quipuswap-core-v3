import { MichelsonMap, MichelsonMapKey } from "@taquito/michelson-encoder";

import { BigNumber } from "bignumber.js";

export namespace quipuswapV3Types {
  export type Address = string;
  // Keeps a positive value with -2^80 precision.

  export type x80n = { x80: BigNumber };

  // Keeps a value with -2^128 precision.
  export type x128 = { x128: BigNumber };

  // Keeps a positive value with -2^128 precision.
  export type x128n = { x128: BigNumber };

  // Tick types, representing pieces of the curve offered between different tick segments.
  export type TickIndex = { i: BigNumber };

  export type BalanceNat = { x: BigNumber; y: BigNumber };
  export type BalanceNatX128 = { x: x128n; y: x128n };
  export type BalanceIntX128 = { x: x128; y: x128 };

  export type TickState = {
    //  Index of the previous initialized tick.
    //     Here we diverge from the article, and effectively store a doubly-linked
    //     list of initialized ticks for speed-up
    //     (while the article proposes storing a bitmap for this purpose).
    //
    prev: TickIndex;

    //  Index of the next initialized tick.
    next: TickIndex;

    //  Total amount of liquidity to add to the contract's global liquidity when
    //     this tick is crossed going up.
    //     (i.e. when the current tick index `i_c` becomes greater than this tick),
    //     or subtracted when the tick is crossed going down.
    //
    liquidity_net: BigNumber;

    //  Numbers of positions with an edge at the given tick.
    //     Used for garbage collection.
    //
    n_positions: BigNumber;

    //  When the current tick index `i_c` is below this tick, this field tracks
    //     the overall number of seconds `i_c` spent above or at this tick.
    //     When `i_c` is above or equal to this tick, it tracks the number of
    //     seconds `i_c` spent below this tick.

    //     This field is updated every time `i_c` crosses this tick.

    //     Here we assume that, during all the time since Unix epoch start till
    //     the moment of tick initialization, i_c was below this tick
    //     (see equation 6.25 of the uniswap v3 whitepaper).
    //     So we actually track the number of seconds with some additive error Δ,
    //     but this Δ remains contant during the lifetime of the tick. Ticks
    //     created at different moments of time will have different Δ though.

    //     As example, let's say the tick was initialized at 1628440000 timestamp;
    //     then `seconds_outside` can be initialized with the same timestamp.
    //     If i_c crossed this tick 5 seconds later, this `seconds_outside` will
    //     be set respectively to 5.
    //     If i_c crossed this tick back 3 seconds later, we will get
    //     `1628440000 + 3 = 1628440003`
    //     (effectively this will be computed as `cur_time - last seconds_outside =
    //     1628440008 - 5 = 1628440003`).

    //     This field helps to evaluate, for instance, how many seconds i_c
    //     has spent in an any given ticks range.
    //
    seconds_outside: BigNumber;

    //  Tick indices accumulator i_o, it keeps track of time-weighted sum of
    //     tick indices, but accounts them only for "outside" periods.
    //     For the intuition for "outside" word, see `seconds_outside`.
    //
    tick_cumulative_outside: BigNumber;

    //  Overall number of fees f_o that were accumulated during the period
    //     when the current tick index i_c was below (or above) this tick.

    //     For intuition for "outside" word, see `seconds_outside`.
    //
    fee_growth_outside: BalanceNatX128;

    //  Seconds-weighted 1/L value accumulator s_lo, it accounts only for
    //     "outside" periods. For intuition for "outside" word, see `seconds_outside`.

    //     This helps us to implement liquidity oracle.
    //
    seconds_per_liquidity_outside: x128n;

    // sqrt(P) = sqrt(X/Y) associated with this tick.
    sqrt_price: x80n;
  };

  export type PositionState = {
    // Position edge tick indices
    lower_tick_index: TickIndex;
    upper_tick_index: TickIndex;

    // The position's owner.
    // By default - position's creator, but ownership can be transferred later.
    owner: Address;

    // Position's liquidity.
    liquidity: BigNumber;

    // Total fees earned by the position at the moment of last fees collection for this position.
    // This helps to evaluate the next portion of fees to collect.
    fee_growth_inside_last: BalanceIntX128;
  };

  export type TickCumulative = {
    // The time-weighted cumulative value.
    sum: BigNumber;
    // Tick index value at the beginning of the block.
    block_start_value: TickIndex;
  };
  export type SplCumulative = {
    // The time-weighted cumulative value.
    sum: x128n;
    // Liquidity value at the beginning of the block.
    block_start_liquidity_value: BigNumber;
  };
  export type TimedCumulatives = {
    time: string;
    tick: TickCumulative;
    spl: SplCumulative;
  };

  export type TimedCumulativesBuffer = {
    // For each index this stores:
    // 1. Cumulative values for every second in the history of the contract
    //    till specific moment of time, as well as last known value for
    //    the sake of future linear extrapolation.
    // 2. Timestamp when this sum was registered.
    //    This allows for bin search by timestamp.
    //
    // Indices in the map are assigned to values sequentially starting from 0.
    //
    // Invariants:
    // a. The set of indices that have an associated element with them is continuous;
    // b. Timestamps in values grow strictly monotonically
    //    (as well as accumulators ofc);
    map: MichelsonMap<MichelsonMapKey, unknown>;

    // Index of the oldest stored value.
    first: BigNumber;

    // Index of the most recently stored value.
    last: BigNumber;

    // Number of actually allocated slots.
    //
    // This value is normally equal to `last - first + 1`.
    // However, in case recently there was a request to extend the set of
    // stored values, this var will keep the demanded number of stored values,
    // while values in the map past `last` will be initialized with garbage.
    //
    // We need to have initialized slots with trash because when the size of
    // the map increases, someone has to pay for the storage diff.
    // And we want it to be paid by the one who requested the extension.
    reserved_length: BigNumber;
  };

  export type Constants = {
    fee_bps: BigNumber;
    ctez_burn_fee_bps: BigNumber;
    x_token_id: BigNumber;
    y_token_id: BigNumber;
    x_token_address: Address;
    y_token_address: Address;
    tick_spacing: BigNumber;
  };

  //// See defaults.mligo for more info
  export type Fixed_point = { v: BigNumber; offset: BigNumber };
  export type Ladder_key = { exp: BigNumber; positive: Boolean };
  export type Ladder = MichelsonMap<MichelsonMapKey, unknown>;

  export type Storage = {
    //// Virtual liquidity, the value L for which the curve locally looks like x * y = L^2.
    liquidity: BigNumber;

    // Square root of the virtual price, the value P for which P = x / y.
    sqrt_price: BigNumber;

    // Index of the highest tick corresponding to a price less than or equal to sqrt_price^2,
    // does not necessarily corresponds to a boundary.
    // Article's notation: i_c, tick.
    cur_tick_index: BigNumber;

    // The highest initialized tick lower than or equal to i_c.
    cur_tick_witness: BigNumber;

    // The total amount of fees that have been earned per unit of virtual liquidity (L),
    // over the entire history of the contract.
    fee_growth: BalanceNatX128;

    // States of all initialized ticks.
    ticks: MichelsonMap<MichelsonMapKey, unknown>;

    // States of positions (with non-zero liquidity).
    positions: MichelsonMap<MichelsonMapKey, unknown>;

    // Cumulative values stored for the recent timestamps.
    cumulatives_buffer: TimedCumulativesBuffer;
    // TZIP-16 metadata.
    metadata: MichelsonMap<MichelsonMapKey, unknown>;

    // Incremental position id to be assigned to new position.
    new_position_id: BigNumber;

    // FA2-related
    operators: MichelsonMap<MichelsonMapKey, unknown>;

    // Constants for options that are settable at origiBigNumberion
    constants: Constants;

    // Exponents ladder for the calculation of 'half_bps_pow'
    ladder: Ladder;
  };
}
