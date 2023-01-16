let deploy_pool (s, p : factory_storage_t * create_dex_t) : return_t =
    let _checkFee = if p.fee_bps >= 10000n
        then failwith too_big_fee_bps_err in

    let pool_key = {
        fee_bps = p.fee_bps ;
        dev_fee_bps = s.dev_fee_bps ;
        token_x = p.token_x ;
        token_y = p.token_y ;
    } in
    let _checkPool = if Big_map.mem pool_key s.pool_ids
        then failwith pool_already_exists_err in

    let pool_storage = init_pool_storage p s.dev_fee_bps in
    let create_op, addr = deploy_pool_func ((None: key_hash option), Tezos.get_amount (), pool_storage) in

    let s = { s with
        pools = Big_map.add s.pool_count addr s.pools ;
        pool_ids = Big_map.add pool_key s.pool_count s.pool_ids ;
        pool_count = s.pool_count + 1n ;
    } in
    ([create_op], s)

