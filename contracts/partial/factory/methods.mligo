let deploy_pool (s, p : factory_storage_t * create_dex_t) : return_t =
    let pool_storage = init_pool_storage (p) in
    let create_op, addr = deploy_pool_func ((None: key_hash option), Tezos.amount, pool_storage) in
    let s = { s with
        pools = Big_map.add s.pool_count addr s.pools ;
        pool_count = s.pool_count + 1n ;
    } in
    ([create_op], s)