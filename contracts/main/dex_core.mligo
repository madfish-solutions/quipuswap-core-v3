// SPDX-FileCopyrightText: 2021 Arthur Breitman
// SPDX-License-Identifier: LicenseRef-MIT-Arthur-Breitman

#include "../partial/common_types.mligo"
#include "../partial/types.mligo"
#include "../partial/consts.mligo"
#include "../partial/helpers.mligo"
#include "../partial/transfers.mligo"
#include "../partial/math.mligo"
#include "../partial/swaps.mligo"
#include "../partial/token/fa2.mligo"
#define DEBUG

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
                    { s with
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
        (maximum_tokens_contributed : balance_nat)
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
    let _: unit = if delta.x > int(maximum_tokens_contributed.x) then
        ([%Michelson ({| { FAILWITH } |} : nat * (nat * int) -> unit)]
            (high_tokens_err, (maximum_tokens_contributed.x, delta.x)) : unit)
        else unit in
    let _: unit = if delta.y > int(maximum_tokens_contributed.y) then
        ([%Michelson ({| { FAILWITH } |} : nat * (nat * int) -> unit)]
            (high_tokens_err, (maximum_tokens_contributed.y, delta.y)) : unit)
        else unit in

    let op_x = if delta.x > 0 then
        wrap_transfer (Tezos.get_sender ()) (Tezos.get_self_address ()) (abs delta.x) s.constants.token_x
    else
#if DEBUG
        let _ : unit = if delta.x <> 0 && to_x = (Tezos.get_self_address ()) then failwith internal_unexpected_income_err else unit in
#endif
        wrap_transfer (Tezos.get_self_address ()) to_x (abs delta.x) s.constants.token_x in

    let op_y = if delta.y > 0 then
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

let set_position (s : storage) (p : set_position_param) : result =
    let _: unit = check_deadline p.deadline in
    let allowed_tick_spacing = s.constants.tick_spacing in
    let _: unit = check_multiple_of_tick_spacing (p.lower_tick_index, allowed_tick_spacing) in
    let _: unit = check_multiple_of_tick_spacing (p.upper_tick_index, allowed_tick_spacing) in
    let _: unit = if p.lower_tick_index >= p.upper_tick_index then failwith tick_order_err else unit in

    // Creating position with 0 liquidity must result in no changes being made
    if p.liquidity = 0n then (([] : operation list), s) else

    (* Initialize ticks if need be. *)
    let ticks = s.ticks in
    let (init_tick_cumul_out, init_fee_growth_out, init_secs_out, init_spl_outside) =
            if s.cur_tick_index.i >= p.lower_tick_index.i then
                let sums = get_last_cumulatives s.cumulatives_buffer in
                ( sums.tick.sum
                , s.fee_growth
                , assert_nat (Tezos.get_now () - epoch_time, internal_epoch_bigger_than_now_err)
                , sums.spl.sum
                )
            else
                ( 0
                , {x = {x128 = 0n} ; y = {x128 = 0n}}
                , 0n
                , {x128 = 0n}
                )
    in
    let ticks =
            initialize_tick
                ( ticks
                , p.lower_tick_index
                , p.lower_tick_witness
                , init_tick_cumul_out
                , init_fee_growth_out
                , init_secs_out
                , init_spl_outside
                , s.ladder
                )
    in
    let (init_tick_cumul_out, init_fee_growth_out, init_secs_out, init_spl_outside) =
            if s.cur_tick_index.i >= p.upper_tick_index.i then
                let sums = get_last_cumulatives s.cumulatives_buffer in
                ( sums.tick.sum
                , s.fee_growth
                , assert_nat (Tezos.get_now () - epoch_time, internal_epoch_bigger_than_now_err)
                , sums.spl.sum
                )
            else
                ( 0
                , {x = {x128 = 0n} ; y = {x128 = 0n}}
                , 0n
                , {x128 = 0n}
                )
    in
    let ticks =
            initialize_tick
                ( ticks
                , p.upper_tick_index
                , p.upper_tick_witness
                , init_tick_cumul_out
                , init_fee_growth_out
                , init_secs_out
                , init_spl_outside
                , s.ladder
                )
    in
    let s = {s with ticks = ticks} in

    let s = update_cur_tick_witness s p.lower_tick_index in
    let s = update_cur_tick_witness s p.upper_tick_index in

    (* Create a new position *)
    let position =
        {   liquidity = p.liquidity;
            fee_growth_inside_last = calc_fee_growth_inside s p.lower_tick_index p.upper_tick_index;
            owner = Tezos.get_sender ();
            lower_tick_index = p.lower_tick_index;
            upper_tick_index = p.upper_tick_index;
        } in
    (* Update related ticks. *)
    let ticks = cover_tick_with_position ticks p.lower_tick_index 1 (int p.liquidity) in
    let ticks = cover_tick_with_position ticks p.upper_tick_index 1 (-p.liquidity) in
    let s = { s with ticks = ticks } in

    let s =
        { s with
            positions = Big_map.add s.new_position_id position s.positions;
            new_position_id = s.new_position_id + 1n;
        } in

    update_balances_after_position_change
        s p.lower_tick_index p.upper_tick_index
        p.maximum_tokens_contributed
        (Tezos.get_self_address ()) (Tezos.get_self_address ()) // Shouldn't be used
        (int p.liquidity) {x = 0n; y = 0n}

let update_position (s : storage) (p : update_position_param) : result =
    let _: unit = check_deadline p.deadline in

    (* Grab the existing position *)
    let position = get_position (p.position_id, s.positions) in
    (* Get accumulated fees for this position. *)
    let s, fees, position = collect_fees s p.position_id position in

    (* Update liquidity of position. *)
    let liquidity_new = assert_nat (position.liquidity + p.liquidity_delta, position_liquidity_below_zero_err) in
    let position = {position with liquidity = liquidity_new} in

    (* How number of positions at related ticks changes. *)
    let positions_num_delta = if liquidity_new = 0n then -1 else 0 in
    (* Update related ticks. *)
    let ticks = s.ticks in
    let ticks = cover_tick_with_position ticks position.lower_tick_index positions_num_delta p.liquidity_delta in
    let ticks = cover_tick_with_position ticks position.upper_tick_index positions_num_delta (-p.liquidity_delta) in
    let s =
        { s with
            ticks = ticks;
            positions = Big_map.add p.position_id position s.positions;
        } in

    let (ops, s) = update_balances_after_position_change
        s position.lower_tick_index position.upper_tick_index
        p.maximum_tokens_contributed
        p.to_x p.to_y
        p.liquidity_delta fees in

    (* Garbage collection *)
    let s = garbage_collection s position p.position_id in

    (ops, s)

// Entrypoint that returns cumulative values at given range at the current moment
// of time.
//
// This works only for initialized indexes.
let snapshot_cumulatives_inside (s, p : storage * snapshot_cumulatives_inside_param) : result =
    // Since we promise to return `nat` values,
    // it is important to check that the requested range is not negative.
    let _: unit = if p.lower_tick_index > p.upper_tick_index then failwith tick_order_err else unit in

    let sums = get_last_cumulatives s.cumulatives_buffer in
    let cums_total =
            { tick = sums.tick.sum
            ; seconds = Tezos.get_now() - epoch_time
            ; seconds_per_liquidity = {x128 = int sums.spl.sum.x128}
            } in

    [@inline]
    let eval_cums (above, index, cums_outside : bool * tick_index * cumulatives_data) =
        // Formulas 6.22 when 'above', 6.23 otherwise
        if (s.cur_tick_index >= index) = above
        then
            { tick =
                cums_total.tick - cums_outside.tick
            ; seconds =
                cums_total.seconds - cums_outside.seconds
            ; seconds_per_liquidity = {x128 =
                cums_total.seconds_per_liquidity.x128 - cums_outside.seconds_per_liquidity.x128
                }
            }
        else
            cums_outside
        in

    let lower_tick = get_tick s.ticks p.lower_tick_index tick_not_exist_err in
    let upper_tick = get_tick s.ticks p.upper_tick_index tick_not_exist_err in

    let lower_cums_outside =
            { tick = lower_tick.tick_cumulative_outside
            ; seconds = int lower_tick.seconds_outside
            ; seconds_per_liquidity = {x128 = int lower_tick.seconds_per_liquidity_outside.x128}
            } in
    let upper_cums_outside =
            { tick = upper_tick.tick_cumulative_outside
            ; seconds = int upper_tick.seconds_outside
            ; seconds_per_liquidity = {x128 = int upper_tick.seconds_per_liquidity_outside.x128}
            } in

    let cums_below_lower = eval_cums(false, p.lower_tick_index, lower_cums_outside) in
    let cums_above_upper = eval_cums(true, p.upper_tick_index, upper_cums_outside) in
    let res =
            { tick_cumulative_inside =
                cums_total.tick
                    - cums_below_lower.tick
                    - cums_above_upper.tick
            ; seconds_inside =
                cums_total.seconds
                    - cums_below_lower.seconds
                    - cums_above_upper.seconds
            ; seconds_per_liquidity_inside = {x128 =
                cums_total.seconds_per_liquidity.x128
                    - cums_below_lower.seconds_per_liquidity.x128
                    - cums_above_upper.seconds_per_liquidity.x128
                }
            }

    in ([Tezos.transaction res 0mutez p.callback], s)

// Increase the number of stored accumulators.
let increase_observation_count (s, p : storage * increase_observation_count_param) : result =
    let buffer = s.cumulatives_buffer in
    // We have to get values close to the real ones because different numbers
    // would take different amount of space in the storage.
    let dummy_timed_cumulatives = get_last_cumulatives buffer in
    let new_reserved_length = buffer.reserved_length + p.added_observation_count in

    let stop_allocation_index = buffer.first + new_reserved_length in
    let rec allocate_buffer_slots (buffer_map, idx : (nat, timed_cumulatives) big_map * nat) : (nat, timed_cumulatives) big_map =
        if idx >= stop_allocation_index
        then buffer_map
        else
            let new_buffer_map = Big_map.add idx dummy_timed_cumulatives buffer_map
            in allocate_buffer_slots(new_buffer_map, idx + 1n)
        in

    let buffer_map = allocate_buffer_slots(buffer.map, buffer.first + buffer.reserved_length) in
    let buffer = {buffer with reserved_length = new_reserved_length; map = buffer_map}
    in (([] : operation list), {s with cumulatives_buffer = buffer})

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

let claim_dev_fee (s : storage) (recipient : address) : result =
    let owner = unwrap (Tezos.call_view "%get_owner" unit s.constants.factory_address : address option ) "not_owner" in
    let _: unit = if Tezos.get_sender () <> owner
        then ([%Michelson ({| { FAILWITH } |} : nat -> unit)]
            (not_owner_err : nat) : unit)
        else unit in

    let op_withdraw_x = wrap_transfer (Tezos.get_self_address ()) recipient s.dev_fee.x s.constants.token_x in
    let op_withdraw_y = wrap_transfer (Tezos.get_self_address ()) recipient s.dev_fee.y s.constants.token_y in
    let updated_s = { s with dev_fee = { x = 0n; y = 0n } }
    in ([op_withdraw_x; op_withdraw_y], updated_s)

let observe (s : storage) (p : observe_param) : result =
    let value = List.map (get_cumulatives s.cumulatives_buffer) p.times
    in ([Tezos.transaction value 0mutez p.callback], s)

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

let get_position_info (s : storage) (p : get_position_info_param) : result =
    let position = get_position(p.position_id, s.positions) in
    let result =
        { liquidity = position.liquidity
        ; owner = position.owner
        ; lower_tick_index = position.lower_tick_index
        ; upper_tick_index = position.upper_tick_index
        }
    in ([Tezos.transaction result 0mutez p.callback], s)

let main ((p, s) : parameter * storage) : result =
let _: unit = if Tezos.get_amount () = 0tez then unit else failwith non_zero_transfer_err in
(* start by updating the oracles *)
let s = update_timed_cumulatives s in
(* dispatch call to the proper entrypoint *)
 match p with
| X_to_y p -> x_to_y s p
| Y_to_x p -> y_to_x s p
| Set_position p -> set_position s p
| Update_position p -> update_position s p
| Get_position_info p -> get_position_info s p
| Claim_dev_fee p -> claim_dev_fee s p
| Call_fa2 p -> call_fa2 s p
| Snapshot_cumulatives_inside p -> snapshot_cumulatives_inside(s, p)
| Observe p -> observe s p
| Increase_observation_count n -> increase_observation_count(s, n)
