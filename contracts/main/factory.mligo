#include "../partial/common_types.mligo"
#include "../partial/types.mligo"
#include "../partial/errors.mligo"
#include "../partial/factory/types.mligo"
#include "../partial/consts.mligo"
#include "../partial/math.mligo"
#include "../partial/defaults.mligo"
#include "../partial/factory/helpers.mligo"
#include "../partial/factory/methods.mligo"
#include "../partial/factory/views.mligo"

let main (action, s : parameter_t * factory_storage_t) : return_t =
 // No operations
 (match action with
  | Deploy_pool (n) -> deploy_pool (s, n)
  | Set_dev_fee (n) -> set_dev_fee (s, n)
 )


