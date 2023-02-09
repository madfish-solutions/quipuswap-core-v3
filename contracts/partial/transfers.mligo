// SPDX-FileCopyrightText: 2021 Arthur Breitman
// SPDX-License-Identifier: LicenseRef-MIT-Arthur-Breitman

// (* Helper functions to create/remove an operator in x and y contracts. *)
// let make_operator_in_y (operator : address) (limit : nat) (c : constants) : operation =
// #if Y_IS_FA2
//     let _limit = limit in // otherwise LIGO complains about 'limit' being unused
//     let param = [ Add_operator
//             { owner = Tezos.self_address
//             ; operator = operator
//             ; token_id = c.y_token_id
//             } ] in
//     let y_contract = match
//         ( Tezos.get_entrypoint_opt "%update_operators" c.y_token_address
//         : y_contract_operator_param contract option
//         ) with
//     | Some contract -> contract
//     | None -> (failwith asset_update_operator_invalid_entrypoints_err : y_contract_operator_param contract) in
// #else
//     let param = (operator, limit) in
//     let y_contract = match
//         ( Tezos.get_entrypoint_opt "%approve" c.y_token_address
//         : y_contract_operator_param contract option
//         ) with
//     | Some contract -> contract
//     | None -> (failwith asset_approve_invalid_entrypoints_err : y_contract_operator_param contract) in
// #endif
//     Tezos.transaction param 0mutez y_contract

// let remove_operator_in_y (operator : address) (c : constants) : operation =
// #if Y_IS_FA2
//     let param = [ Remove_operator
//             { owner = Tezos.self_address
//             ; operator = operator
//             ; token_id = c.y_token_id
//             } ] in
//     let y_contract = match
//         ( Tezos.get_entrypoint_opt "%update_operators" c.y_token_address
//         : y_contract_operator_param contract option
//         ) with
//     | Some contract -> contract
//     | None -> (failwith asset_update_operator_invalid_entrypoints_err : y_contract_operator_param contract) in
// #else
//     let param = (operator, 0n) in
//     let y_contract = match
//         ( Tezos.get_entrypoint_opt "%approve" c.y_token_address
//         : y_contract_operator_param contract option
//         ) with
//     | Some contract -> contract
//     | None -> (failwith asset_approve_invalid_entrypoints_err : y_contract_operator_param contract) in
// #endif
//     Tezos.transaction param 0mutez y_contract


let wrap_fa2_transfer_trx (from_ : address) (to_ : address) (amount : nat) (token_id : nat) : transfer_params =
    let transfer_destination : transfer_destination = {
        to_ = to_;
        token_id = token_id;
        amount = amount;
    } in
    let transfer_param : transfer_item = {
        from_ = from_;
        txs = [ transfer_destination ];
    } in
    [ transfer_param ]


let get_fa12_transfer_entrypoint (contract_address : address) : fa12_transfer_t contract =
    match (Tezos.get_entrypoint_opt "%transfer" contract_address : fa12_transfer_t contract option) with
    | None -> (failwith asset_transfer_invalid_entrypoints_err : fa12_transfer_t contract)
    | Some contract -> contract


let fa2_transfer (from_ : address) (to_ : address) (amount : nat) (token_id : nat) (token_address : address) : operation =
    let fa2_contract =
    match (Tezos.get_entrypoint_opt "%transfer" token_address : transfer_params contract option) with
    | None -> (failwith asset_transfer_invalid_entrypoints_err : transfer_params contract)
    | Some contract -> contract in
    Tezos.transaction (wrap_fa2_transfer_trx from_ to_ amount token_id) 0mutez fa2_contract

let wrap_transfer (from_ : address) (to_ : address) (amnt : nat) (token : asset_standard_t) : operation =
    match token with
    | Fa12(address_) -> Tezos.transaction (from_, (to_, amnt)) 0mutez (get_fa12_transfer_entrypoint address_)
    | Fa2(token_) -> fa2_transfer from_ to_ amnt token_.token_id token_.token_address
//  | Tez -> Tezos.transaction unit (amnt * 1mutez) ((Tezos.get_contract_with_error to_ "Not Default entrypoint") : unit contract)


