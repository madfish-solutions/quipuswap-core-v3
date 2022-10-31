# Test coverage for contracts

## Position.tests

    - ✅ Swapping within a single tick range
      actions:

      checks:

    - ✅ Placing many small swaps is (mostly) equivalent to placing 1 big swap
      actions:

      checks:

    - ✅ Executing a swap within a single tick range or across many ticks should be (mostly) equivalent
      actions:

      checks:

    - ✅ Fees are correctly assigned to each position
      actions:

      checks:

    - ✅ Swap fails if the user would receiver less than min_dx
      actions:

      checks:

    - ✅ Swap fails if it's past the deadline
      actions:

      checks:

    - ✅ After crossing into a 0-liquidity range, swaps are no-ops
      actions:

      checks:

    - ✅ Invariants hold when pushing the cur_tick_index just below cur_tick_witness
      actions:

      checks:

    - ✅ Protocol fees are effectively burned
      actions:

      checks:
