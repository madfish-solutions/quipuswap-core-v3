type fa12_token_t = address

type fa2_token_t =
    [@layout:comb]
    { token_id : nat
    ; token_address : address
    }

type asset_standard_t =
    [@layout:comb]
    | Fa12 of fa12_token_t
    | Fa2  of fa2_token_t
    // | Tez  of unit