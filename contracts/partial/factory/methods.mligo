let deploy_pool (s, p : factory_storage_t * create_dex_t) : return_t =
    let _check_fee = if p.fee_bps >= 10000n
        then failwith too_big_fee_bps_err in

    let _check_tick_spacing = if p.tick_spacing = 0n || p.tick_spacing > const_max_tick
        then failwith incorrect_tick_spacing_err in

    let pool_key = {
        fee_bps = p.fee_bps ;
        token_x = p.token_x ;
        token_y = p.token_y ;
    } in
    let _check_pool = if Big_map.mem pool_key s.pool_ids
        then failwith pool_already_exists_err in

    let pool_storage = init_pool_storage p in
    let create_op, addr = deploy_pool_func ((None: key_hash option), Tezos.get_amount (), pool_storage) in

    let s = { s with
        pools = Big_map.add s.pool_count addr s.pools ;
        pool_ids = Big_map.add pool_key s.pool_count s.pool_ids ;
        pool_count = s.pool_count + 1n ;
    } in
    ([create_op], s)

let set_dev_fee (s, p : factory_storage_t * nat) : return_t =
    let _checkOwner = if s.owner <> (Tezos.get_sender ())
        then failwith not_owner_err in

    let _checkFee = if p >= 10000n
        then failwith too_big_fee_bps_err in

    ([], { s with dev_fee_bps = p })

let set_pause (s, p : factory_storage_t * pause_etp set) : return_t =
    let _checkOwner = if s.owner <> (Tezos.get_sender ())
        then failwith not_owner_err in

    ([], { s with pause_state = p })

let set_owner (s, p : factory_storage_t * address) : return_t =
    let _checkOwner = if s.owner <> (Tezos.get_sender ())
        then failwith not_owner_err in

    ([], { s with pending_owner = Some p})

let confirm_owner (s : factory_storage_t) : return_t =
    match s.pending_owner with
    | None -> failwith no_pending_owner_err
    | Some pending_owner ->
        let _checkOwner = if pending_owner <> (Tezos.get_sender ())
            then failwith not_pending_owner_err in

        ([], { s with owner = Tezos.get_sender () ; pending_owner = None })