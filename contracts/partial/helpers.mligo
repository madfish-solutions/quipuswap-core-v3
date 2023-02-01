// SPDX-FileCopyrightText: 2021 Arthur Breitman
// SPDX-License-Identifier: LicenseRef-MIT-Arthur-Breitman

#if HELPERS_MLIGO
#else
#define HELPERS_MLIGO

(*  Calculate the new `sqrt_price` after a deposit of `dx` `x` tokens.
    Derived from equation 6.15:
        Δ(1 / √P) = Δx / L
        1 / √P_new - 1 / √P_old = Δx / L
    Since we store √P mutiplied by 2^80 (i.e. sqrt_price = √P * 2^80):
        1 / (sqrt_price_new / 2^80) - 1 / (sqrt_price_old / 2^80) = Δx / L
    Solving for sqrt_price_new:
        sqrt_price_new = (2^80 * L * sqrt_price_old) / (2^80 * L + Δx * sqrt_price_old)

    Example:
        Assume a pool with 10 `x` tokens and 1000 `y` tokens, which implies:
            L = sqrt(xy) = sqrt(10*1000) = 100
            P = y/x = 1000/10 = 100
            sqrt_price = sqrt(100) * 2^80 = 12089258196146291747061760

        Adding 10 `x` tokens to the pool should result in:
            x = 20
            y = L^2 / x = 500
            P = 500 / 20 = 25
            sqrt_price = sqrt(25) * 2^80 = 6044629098073145873530880

        And indeed:
            $ ligo compile-expression --init-file ligo/helpers.mligo cameligo \
              "sqrt_price_move_x 100n {x80 = 12089258196146291747061760n} 10n"
            6044629098073145873530880
   *)
[@inline]
let sqrt_price_move_x (liquidity : nat) (sqrt_price_old : x80n) (dx : nat) : x80n =
    (* floordiv because we want to overstate how much this trade lowers the price *)
    let sqrt_price_new =
        {x80 = ceildiv
            (Bitwise.shift_left (liquidity * sqrt_price_old.x80) 80n)
            ((Bitwise.shift_left liquidity 80n) + dx * sqrt_price_old.x80)
        } in
#if DEBUG
    let _ : unit =
        if sqrt_price_new <= sqrt_price_old
            then unit
            else failwith "sqrt_price_move_x: sqrt_price moved in the wrong direction" in
#endif
    sqrt_price_new


(*  Calculate the new `sqrt_price` after a deposit of `dy` `y` tokens.
    Derived from equation 6.13:
        Δ(√P) = Δy /L
        √P_new - √P_old = Δy /L
    Since we store √P mutiplied by 2^80 (i.e. sqrt_price = √P * 2^80):
        sqrt_price_new / 2^80 - sqrt_price_old / 2^80 = Δy /L
    Solving for sqrt_price_new:
        sqrt_price_new = 2^80 * (Δy / L) + sqrt_price_old

    Example:
        Assume a pool with 10 `x` tokens and 1000 `y` tokens, which implies:
            L = sqrt(xy) = sqrt(10*1000) = 100
            P = y/x = 1000/10 = 100
            sqrt_price = sqrt(100) * 2^80 = 12089258196146291747061760

        Adding 1000 `y` tokens to the pool should result in:
            y = 2000
            x = L^2 / y = 5
            P = 2000 / 5 = 400
            sqrt_price = sqrt(400) * 2^80 = 24178516392292583494123520

        And indeed:
            $ ligo compile-expression --init-file ligo/helpers.mligo cameligo \
              "sqrt_price_move_y 100n {x80 = 12089258196146291747061760n} 1000n"
            24178516392292583494123520
   *)
let sqrt_price_move_y (liquidity : nat) (sqrt_price_old : x80n) (dy : nat) : x80n =
    (* ceildiv because we want to overstate how much this trade increases the price *)
    let sqrt_price_new =
        { x80 =
            floordiv (Bitwise.shift_left dy 80n) liquidity + sqrt_price_old.x80
        } in
#if DEBUG
    let _ : unit =
        if sqrt_price_new >= sqrt_price_old
            then unit
            else failwith "sqrt_price_move_y: sqrt_price moved in the wrong direction" in
#endif
    sqrt_price_new

(* Helper function to grab a tick we know exists in the tick indexed state. *)
[@inline]
let get_tick (ticks : (tick_index, tick_state) big_map) (index: tick_index) (error_code: nat) : tick_state =
    match Big_map.find_opt index ticks with
    | None -> failwith error_code
    | Some state -> state

[@inline]
let get_positions (position_ids: position_ids_map) (owner: address) : nat set =
    match Big_map.find_opt owner position_ids with
    | None -> Set.empty
    | Some ids -> ids

(* Check if a request has expired. *)
[@inline]
let check_deadline (deadline : timestamp) : unit =
    if Tezos.get_now() > deadline
        then ([%Michelson ({| { FAILWITH } |} : nat * (timestamp * timestamp) -> unit)]
            (past_deadline_err, (deadline, Tezos.get_now())) : unit)
        else unit

[@inline]
let check_position_owner (owner : address) : unit =
    if owner <> (Tezos.get_sender ())
        then ([%Michelson ({| { FAILWITH } |} : nat -> unit)]
            (not_owner_err : nat) : unit)
        else unit

[@inline]
let get_registered_cumulatives_unsafe (buffer : timed_cumulatives_buffer) (i : nat) : timed_cumulatives =
    match Big_map.find_opt i buffer.map with
    | None -> failwith internal_bad_access_to_observation_buffer
    | Some v -> v

[@inline]
let get_last_cumulatives (buffer : timed_cumulatives_buffer) : timed_cumulatives =
    get_registered_cumulatives_unsafe buffer buffer.last


(* Ensure tick index is multiple of tick spacing. *)
[@inline]
let check_multiple_of_tick_spacing (tick_index, tick_spacing: tick_index * nat) : unit =
    if (tick_index.i mod tick_spacing = 0n)
        then unit
        else failwith incorrect_tick_spacing_err

#endif

[@inline] let unwrap (type a) (x : a option) (error : string) : a =
    match x with
    | None -> failwith error
    | Some x -> x


let rec initialize_tick ((ticks, tick_index, tick_witness,
    initial_tick_cumulative_outside,
    initial_fee_growth_outside,
    initial_seconds_outside,
    initial_seconds_per_liquidity_outside,
    ladder) : tick_map * tick_index * tick_index * int * balance_nat_x128 * nat * x128n * ladder) : tick_map =
    if Big_map.mem tick_index ticks then
        ticks
    else if tick_witness.i > tick_index.i then
        (failwith invalid_witness_err : tick_map)
    else
        let tick = get_tick ticks tick_witness tick_not_exist_err in
        let next_tick_index = tick.next in
        if next_tick_index.i > tick_index.i then
            let tick_next = get_tick ticks next_tick_index internal_tick_not_exist_err in
            let ticks = Big_map.add tick_witness {tick with next = tick_index} ticks in
            let ticks = Big_map.add next_tick_index {tick_next with prev = tick_index} ticks in
            let ticks = Big_map.add tick_index {
                prev = tick_witness ;
                next = next_tick_index ;
                liquidity_net = 0 ;
                n_positions = 0n ;
                tick_cumulative_outside = initial_tick_cumulative_outside;
                fee_growth_outside = initial_fee_growth_outside;
                seconds_outside = initial_seconds_outside;
                seconds_per_liquidity_outside = initial_seconds_per_liquidity_outside;
                sqrt_price = half_bps_pow (tick_index.i, ladder)} ticks in
            ticks
        else
            initialize_tick
                ( ticks, tick_index, next_tick_index
                , initial_tick_cumulative_outside
                , initial_fee_growth_outside
                , initial_seconds_outside
                , initial_seconds_per_liquidity_outside
                , ladder
                )

(* Account for the fact that this tick is a boundary for one more (or one less) position. *)
let cover_tick_with_position (ticks : tick_map) (tick_index : tick_index) (pos_delta : int) (liquidity_delta : int) =
    let tick = get_tick ticks tick_index internal_tick_not_exist_err in
    let n_pos = assert_nat (tick.n_positions + pos_delta, internal_position_underflow_err) in
    let new_liquidity = tick.liquidity_net + liquidity_delta in
    Big_map.add tick_index
        { tick with
            n_positions = n_pos;
            liquidity_net = new_liquidity
        } ticks

(*  Garbage collect the tick.
    The largest and smallest tick are initialized with n_positions = 1 so they cannot
    be accidentally garbage collected. *)
let garbage_collect_tick (s : storage) (tick_index : tick_index) : storage =
    let tick = get_tick s.ticks tick_index internal_tick_not_exist_err in

    if tick.n_positions = 0n then
#if DEBUG
        let _ : unit = if tick.liquidity_net <> 0 then
            failwith internal_non_empty_position_gc_err
            else unit in
#endif
        let ticks = s.ticks in
        let prev = get_tick ticks tick.prev internal_tick_not_exist_err in
        let next = get_tick ticks tick.next internal_tick_not_exist_err in
        (* prev links to next and next to prev, skipping the deleted tick *)
        let prev = {prev with next = tick.next} in
        let next = {next with prev = tick.prev} in
        let ticks = Big_map.remove tick_index ticks in
        let ticks = Big_map.update tick.prev (Some prev) ticks in
        let ticks = Big_map.update tick.next (Some next) ticks in

        (* If this tick is the `cur_tick_witness`, then deleting the tick would invalidate `cur_tick_witness`,
           so we need to move it to the previous initialized tick.
        *)
        let cur_tick_witness = if s.cur_tick_witness = tick_index then tick.prev else s.cur_tick_witness in

        {s with ticks = ticks; cur_tick_witness = cur_tick_witness }
    else
        s

(*  Garbage collects:
      * the position if its liquidity becomes 0,
      * and the ticks if they are no longer the boundaries of any existing position.
*)
let garbage_collection (s : storage) (position : position_state) (position_id : position_id) : storage =
    let s = if position.liquidity = 0n
                then
                    let owner_positions = get_positions s.position_ids (position.owner) in
                    let updated_owner_positions = Set.remove position_id owner_positions in
                    { s with
                        position_ids = Big_map.update (position.owner) (Some updated_owner_positions) s.position_ids;
                        positions = Big_map.remove position_id s.positions;
                    }
                else s in
    let s = garbage_collect_tick s position.lower_tick_index in
    let s = garbage_collect_tick s position.upper_tick_index in
    s

let calc_fee_growth_inside (s : storage) (lower_tick_index : tick_index) (upper_tick_index : tick_index) : balance_int_x128 =
    let lower_tick = get_tick s.ticks lower_tick_index internal_tick_not_exist_err in
    let upper_tick = get_tick s.ticks upper_tick_index internal_tick_not_exist_err in

    // equation 6.17
    let fee_above =
        if s.cur_tick_index.i >= upper_tick_index.i then
            { x = {x128 = assert_nat (s.fee_growth.x.x128 - upper_tick.fee_growth_outside.x.x128, internal_311) };
              y = {x128 = assert_nat (s.fee_growth.y.x128 - upper_tick.fee_growth_outside.y.x128, internal_311) };
            }
        else
            upper_tick.fee_growth_outside in
    // equation 6.18
    let fee_below =
        if s.cur_tick_index.i >= lower_tick_index.i then
            lower_tick.fee_growth_outside
        else
            { x = {x128 = assert_nat (s.fee_growth.x.x128 - lower_tick.fee_growth_outside.x.x128, internal_312) };
              y = {x128 = assert_nat (s.fee_growth.y.x128 - lower_tick.fee_growth_outside.y.x128, internal_312) };
            } in
    // equation 6.19
    { x = {x128 = s.fee_growth.x.x128 - fee_above.x.x128 - fee_below.x.x128 };
      y = {x128 = s.fee_growth.y.x128 - fee_above.y.x128 - fee_below.y.x128 };
    }

let collect_fees (s : storage) (key : position_id) (position : position_state) : storage * balance_nat * position_state =
    let fee_growth_inside = calc_fee_growth_inside s position.lower_tick_index position.upper_tick_index in
    let fees = {
        x = Bitwise.shift_right ((assert_nat (fee_growth_inside.x.x128 - position.fee_growth_inside_last.x.x128, internal_316)) * position.liquidity) 128n;
        y = Bitwise.shift_right ((assert_nat (fee_growth_inside.y.x128 - position.fee_growth_inside_last.y.x128, internal_317)) * position.liquidity) 128n} in
    let position = {position with fee_growth_inside_last = fee_growth_inside} in
    let positions = Big_map.add key position s.positions in
    ({s with positions = positions}, fees, position)


let update_balances_after_position_change
        (s : storage)
        (lower_tick_index : tick_index) (upper_tick_index : tick_index)
        (maximum_tokens_contributed : balance_int)
        (to_x : address) (to_y : address)
        (liquidity_delta : int) (fees : balance_nat) : result =
    (* Compute how much should be deposited / withdrawn to change liquidity by liquidity_net *)

    (* Grab cached prices for the interval *)
    let ticks = s.ticks in
    let tick_u = get_tick ticks upper_tick_index internal_tick_not_exist_err in
    let tick_l = get_tick ticks lower_tick_index internal_tick_not_exist_err in
    let srp_u = tick_u.sqrt_price in
    let srp_l = tick_l.sqrt_price in

    (* Add or remove liquidity above the current tick *)
    let (s, delta) =
    if s.cur_tick_index.i < lower_tick_index.i then
        (s, {
            (* If I'm adding liquidity, x will be positive, I want to overestimate it, if x I'm taking away
                liquidity, I want to to underestimate what I'm receiving. *)
            x = ceildiv_int (liquidity_delta * (int (Bitwise.shift_left (assert_nat (srp_u.x80 - srp_l.x80, internal_sqrt_price_grow_err_1)) 80n))) (int (srp_l.x80 * srp_u.x80)) ;
            y = 0})
    else if lower_tick_index.i <= s.cur_tick_index.i && s.cur_tick_index.i < upper_tick_index.i then
        (* update interval we are in, if need be ... *)
        let s = { s with
                    liquidity = assert_nat (s.liquidity + liquidity_delta, position_liquidity_below_zero_err)
                } in
        (s, {
            x = ceildiv_int (liquidity_delta * (int (Bitwise.shift_left (assert_nat (srp_u.x80 - s.sqrt_price.x80, internal_sqrt_price_grow_err_2)) 80n))) (int (s.sqrt_price.x80 * srp_u.x80)) ;
            y = ceildiv_int (liquidity_delta * (s.sqrt_price.x80 - srp_l.x80)) pow_2_80
            })
    else (* cur_tick_index >= p.upper_tick_index *)
        (s, {x = 0 ; y = ceildiv_int (liquidity_delta * (srp_u.x80 - srp_l.x80)) pow_2_80 }) in

    (* Collect fees to increase withdrawal or reduce required deposit. *)
    let delta = {x = delta.x - fees.x ; y = delta.y - fees.y} in

    (* Check delta doesn't exceed maximum_tokens_contributed. *)
    let _: unit = if delta.x > maximum_tokens_contributed.x then
        ([%Michelson ({| { FAILWITH } |} : nat * (int * int) -> unit)]
            (high_tokens_err, (maximum_tokens_contributed.x, delta.x)) : unit)
        else unit in
    let _: unit = if delta.y > maximum_tokens_contributed.y then
        ([%Michelson ({| { FAILWITH } |} : nat * (int * int) -> unit)]
            (high_tokens_err, (maximum_tokens_contributed.y, delta.y)) : unit)
        else unit in

    let op_x = if delta.x >= 0 then
        wrap_transfer (Tezos.get_sender ()) (Tezos.get_self_address ()) (abs delta.x) s.constants.token_x
    else
#if DEBUG
        let _ : unit = if delta.x <> 0 && to_x = (Tezos.get_self_address ()) then failwith internal_unexpected_income_err else unit in
#endif
        wrap_transfer (Tezos.get_self_address ()) to_x (abs delta.x) s.constants.token_x in

    let op_y = if delta.y >= 0 then
        wrap_transfer (Tezos.get_sender ()) (Tezos.get_self_address ()) (abs delta.y) s.constants.token_y
    else
#if DEBUG
        let _ : unit = if delta.y <> 0 && to_x = (Tezos.get_self_address () ) then failwith internal_unexpected_income_err else unit in
#endif
        wrap_transfer (Tezos.get_self_address () ) to_y (abs delta.y) s.constants.token_y in

    ([op_x ; op_y], s )

(*  Checks if a new tick sits between `cur_tick_witness` and `cur_tick_index`.
    If it does, we need to move `cur_tick_witness` forward to maintain its invariant:
        `cur_tick_witness` is the highest initialized tick lower than or equal to `cur_tick_index`.
*)
[@inline]
let update_cur_tick_witness (s : storage) (tick_index : tick_index) : storage =
    if tick_index > s.cur_tick_witness && tick_index <= s.cur_tick_index
        then { s with cur_tick_witness = tick_index }
        else s

// Calculate seconds_per_liquidity cumulative diff.
[@inline]
let eval_seconds_per_liquidity_x128(liquidity, duration : nat * nat) =
    if liquidity = 0n
    // It actually doesn't really matter how much we add to this accumulator
    // when there is no active liquidity. When calculating a liquidity miner's
    // rewards, we only care about the 'seconds per liquidity' accumulator's
    // value while the current tick was inside the position's range
    // (i.e., while the contract's liquidity was not zero).
    then 0n
    else Bitwise.shift_left duration 128n / liquidity

// Recursive helper for `get_cumulatives`
let rec find_cumulatives_around (buffer, t, l, r : timed_cumulatives_buffer * timestamp * (nat * timed_cumulatives) * (nat * timed_cumulatives)) : (timed_cumulatives * timed_cumulatives * nat) =
    let (l_i, l_v) = l in
    let (r_i, r_v) = r in
    // Binary search, invariant: l_v.time <= t && t < r_v.time
    if l_i + 1n < r_i
    then
        let m_i = (l_i + r_i) / 2n in
        let m_v = get_registered_cumulatives_unsafe buffer m_i in
        let m = (m_i, m_v) in
        let (new_l, new_r) = if m_v.time > t then (l, m) else (m, r) in
        find_cumulatives_around (buffer, t, new_l, new_r)
    else
        (l_v, r_v, assert_nat (t - l_v.time, internal_observe_bin_search_failed))

let get_cumulatives (buffer : timed_cumulatives_buffer) (t : timestamp) : cumulatives_value =
    let l_i = buffer.first in
    let r_i = buffer.last in
    let l_v = get_registered_cumulatives_unsafe buffer l_i in
    let r_v = get_registered_cumulatives_unsafe buffer r_i in

    let _: unit = if t < l_v.time
        then ([%Michelson ({| { FAILWITH } |} : nat * (timestamp * timestamp) -> unit)]
            (observe_outdated_timestamp_err, (l_v.time, t)) : unit)
        else unit in
    let _: unit = if t > r_v.time
        then ([%Michelson ({| { FAILWITH } |} : nat * (timestamp * timestamp) -> unit)]
            (observe_future_timestamp_err, (r_v.time, t)) : unit)
        else unit in

    if t < r_v.time then
        let (sums_at_left, sums_at_right, time_delta) = find_cumulatives_around (buffer, t, (l_i, l_v), (r_i, r_v))

        // When no updates to contract are performed, time-weighted accumulators grow
        // linearly. Extrapolating to get the value at timestamp in-between.
        //
        // tick_cumulative(t) and seconds_per_liquidity_cumulative(t) functions produced
        // by this extrapolation are continuous.
        // 1. At [left, right) range found by the binary search above, cumulatives are
        //    continuous by construction - our extrapolation is linear.
        // 2. At (right - o, right] range they are also continous, because we will
        //    use the same formula for calculating cumulatives at `right - o` (here)
        //    and at `right` (see how `sum` fields are updated in `update_timed_cumulatives`).
        in  { tick_cumulative =
                let at_left_block_end_tick_value = sums_at_right.tick.block_start_value
                in sums_at_left.tick.sum + time_delta * at_left_block_end_tick_value.i
            ; seconds_per_liquidity_cumulative =
                let at_left_block_end_spl_value = sums_at_right.spl.block_start_liquidity_value
                in {x128 = sums_at_left.spl.sum.x128 +
                    eval_seconds_per_liquidity_x128(at_left_block_end_spl_value, time_delta) }
            }
    else // t = r_v.time
        // This means that t = timestamp of the last recorded entry,
        // and we cannot use extrapolation as above
        { tick_cumulative = r_v.tick.sum
        ; seconds_per_liquidity_cumulative = r_v.spl.sum
        }

// Update the cumulative values stored for the recent timestamps.
//
// This has to be called on every update to the contract, not necessarily
// for each block. Currently all cumulatives keep time-weighted sum of something,
// so we can extrapolate these cumulatives on periods of the contract's inactivity.
let update_timed_cumulatives (s : storage) : storage =
    let buffer = s.cumulatives_buffer in

    let last_value = get_last_cumulatives buffer in
    (* Update not more often than once per block *)
    if last_value.time = Tezos.get_now() then s
    else
        let time_passed = abs (Tezos.get_now() - last_value.time) in
        let new_value =
            { tick =
                { block_start_value = s.cur_tick_index
                ; sum = last_value.tick.sum + time_passed * s.cur_tick_index.i
                }
            ; spl =
                { block_start_liquidity_value = s.liquidity
                ; sum =
                    let spl_since_last_block_x128 =
                        eval_seconds_per_liquidity_x128(s.liquidity, time_passed) in
                    {x128 = last_value.spl.sum.x128 + spl_since_last_block_x128};
                }
            ; time = Tezos.get_now()
            } in

        let new_last = buffer.last + 1n in
        let (new_first, delete_old) =
            // preserve the oldest element if reserves allow this
            if buffer.last - buffer.first < buffer.reserved_length - 1
            then (buffer.first, false) else (buffer.first + 1n, true) in
        let new_map = Big_map.add new_last new_value buffer.map in
        let new_map = if delete_old
            then Big_map.remove buffer.first new_map
            else new_map in

        let new_buffer = {
            map = new_map ;
            last = new_last ;
            first = new_first ;
            reserved_length = buffer.reserved_length ;
        }
        in {s with cumulatives_buffer = new_buffer}

[@inline]let check_pause (etp, factory_address: pause_etp * address) : unit =
    let paused = unwrap
        (Tezos.call_view "check_pause" etp factory_address : bool option )
        "not check pause etp" in

    if paused
    then ([%Michelson ({| { FAILWITH } |} : nat * pause_etp -> unit)]
         (paused_etp_err, etp) : unit)
    else unit

[@inline]let get_dev_fee (factory_address : address) : nat =
    unwrap (Tezos.call_view "get_dev_fee" unit factory_address : nat option ) "not_get_dev_fee"