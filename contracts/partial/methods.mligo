let claim_dev_fee (s : storage) (recipient : address) : result =
    let owner = unwrap (Tezos.call_view "get_owner" unit s.constants.factory_address : address option ) "not_get_owner" in
    let _: unit = if Tezos.get_sender () <> owner
        then ([%Michelson ({| { FAILWITH } |} : nat -> unit)]
            (not_owner_err : nat) : unit)
        else unit in

    let ops = [] in
    let ops = if s.dev_fee.x > 0n then
        let op = wrap_transfer (Tezos.get_self_address ()) recipient s.dev_fee.x s.constants.token_x in
        op :: ops
    else
        ops
    in

    let ops = if s.dev_fee.y > 0n then
        let op = wrap_transfer (Tezos.get_self_address ()) recipient s.dev_fee.y s.constants.token_y in
        op :: ops
    else
        ops
    in

    (ops, {s with dev_fee = { x = 0n; y = 0n }})

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

let get_position_info (s : storage) (p : get_position_info_param) : result =
    let position = get_position(p.position_id, s.positions) in
    let result =
        { liquidity = position.liquidity
        ; owner = position.owner
        ; lower_tick_index = position.lower_tick_index
        ; upper_tick_index = position.upper_tick_index
        }
    in ([Tezos.transaction result 0mutez p.callback], s)

let observe (s : storage) (p : observe_param) : result =
    let value = List.map (get_cumulatives s.cumulatives_buffer) p.times
    in ([Tezos.transaction value 0mutez p.callback], s)

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

let set_position (s : storage) (p : set_position_param) : result =
    let _: unit = check_pause (Set_position_pause, s.constants.factory_address) in
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

    let user_positions: nat set = get_positions s.position_ids (Tezos.get_sender ()) in
    let new_position_ids = Set.add s.new_position_id user_positions in
    let s =
        { s with
            positions = Big_map.add s.new_position_id position s.positions;
            position_ids = Big_map.add (Tezos.get_sender ()) new_position_ids s.position_ids;
            new_position_id = s.new_position_id + 1n;
        } in

    update_balances_after_position_change
        s p.lower_tick_index p.upper_tick_index
        {x = int(p.maximum_tokens_contributed.x) ; y = int(p.maximum_tokens_contributed.y)}
        (Tezos.get_self_address ()) (Tezos.get_self_address ()) // Shouldn't be used
        (int p.liquidity) {x = 0n; y = 0n}

let update_position (s : storage) (p : update_position_param) : result =
    let _: unit = check_pause (Update_position_pause, s.constants.factory_address) in
    let _: unit = check_deadline p.deadline in

    (* Grab the existing position *)
    let position = get_position (p.position_id, s.positions) in

    (* Checking that the sender is the owner of the position. *)
    let _check_owner: unit = check_position_owner position.owner in

    (* Check that the position is not empty. *)
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
