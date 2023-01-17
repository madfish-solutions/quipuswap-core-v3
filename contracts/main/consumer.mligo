
type x128 = { x128 : int }

type cumulatives_inside_snapshot_t = {
    tick_cumulative_inside : int ;
    seconds_per_liquidity_inside : x128 ;
    seconds_inside : int ;
}

type storage_t = {
  snapshot_id : nat ;
  snapshots : (nat, cumulatives_inside_snapshot_t) map
}
type return_t = (operation list * storage_t)

let main (p, s : cumulatives_inside_snapshot_t * storage_t) : return_t =
  let cumulatives_inside_snapshots = Map.add s.snapshot_id p s.snapshots in
  let updated_storage = {
    snapshot_id = s.snapshot_id + 1n ;
    snapshots = cumulatives_inside_snapshots
  } in
  ([], updated_storage)



