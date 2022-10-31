# Test coverage for contracts

## Position.tests

    - ✅ Setting a position with lower_tick=upper_tick fails : $ setPosition cfmm 1 (100, 100)
      expectFailedWith: tickOrderErr

    - ✅ Setting a position with lower_tick>upper_tick fails : $ setPosition cfmm 1 (100, 99)
      expectFailedWith: tickOrderErr

    - ✅ Setting a position with zero liquidity is a no-op : $ setPosition cfmm 0 (-100, 100)
      -- The storage shouldn't have changed (with few exceptions)

    - ✅ Depositing and withdrawing the same amount of liquidity is a no-op: $ setPosition cfmm 1_e7 (-10, 15)
                                                                             $ updatePosition cfmm liquidityProvider -1_e7 0
      -- The storage shouldn't have changed (with few exceptions).
      getFullStorage cfmm @@== initialSt
      { sNewPositionId = sNewPositionId initialSt + 1
      , sCumulativesBuffer = cumulativesBuffer1 now
      }
      -- The contract's balance should be 0:
      (xBalance, yBalance) <- balancesOf balanceConsumers cfmm
      checkCompares xBalance elem [0, 1]
      checkCompares yBalance elem [0, 1]
    - ✅ Adding liquidity twice is the same as adding it once: -- Add liquidity twice to cfmm1
                                                                $ setPosition cfmm1 liquidityDelta (-25, 15)
                                                                $ updatePosition cfmm1 liquidityProvider (toInteger liquidityDelta) 0
                                                               -- Add twice the liquidity once to cfmm2
                                                                $ setPosition cfmm2 (2 * liquidityDelta) (-25, 15)
      -- The two contracts should have the same storage and the same balance.
      -- There may be a -/+1 margin of the error in the balance calculations.
     st1 <- getFullStorage cfmm1
     st2 <- getFullStorage cfmm2
     st1 @== st2
     ((cfmm1XBalance, cfmm2XBalance), (cfmm1YBalance, cfmm2YBalance)) <- balancesOfMany balanceConsumers (cfmm1, cfmm2)

    - ✅ Witnesses must be valid: $ Set_position cfmm with wrong sppLowerTickWitness & sppUpperTickWitness
      expectFailedWith: tickNotExistErr
                                : $ Set_positon cfmm with ???unknown what???
      expectFailedWith: invalidWitnessErr

    - ✅ Fails if it's past the deadline: $ Set_position cfmm with expiredDeadline
      expectFailedWith: pastDeadlineErr
                                        : $ Set_position cfmm without fail
                                        : $ Update_position with expiredDeadLine
      expectFailedWith: pastDeadlineErr

    - ✅ Fails if a tick index is not a multiple of 'tick_spacing': $ Set_position cfmm with invalidLowerTickIndex
      expectFailedWith: incorrectTickSpacingErr
                                                                  : $ Set_position cfmm with invalidUpperTickIndex
      expectFailedWith: incorrectTickSpacingErr
                                                                  : $ Set_position cfmm without failwith

    - ✅ Cannot set a position with upper_tick > max_tick: $ setPosition cfmm 1 (-10, maxTickIndex + 1)
      expectFailedWith: tickNotExistErr

    - ✅ Cannot transfer more than maximum_tokens_contributed: $ Set_position cfmm (PerToken 1 1, maxTickIndex -10, minTickIndex 10)
      expectFailedWith: highTokensErr
                                                             -- Also check "Update_position"
                                                               $ Update_position cfmm (PositionId 0,  PerToken 1 1)
      expectFailedWith: highTokensErr

    - ✅ Lowest and highest ticks cannot be garbage collected: $ setPosition cfmm 1 (minTickIndex, maxTickIndex)
                                                               $ updatePosition cfmm liquidityProvider (-1) 0
      -- The storage shouldn't have changed (with few exceptions).
      now <- getNow
      getFullStorage cfmm @@== initialSt
      { sNewPositionId = sNewPositionId initialSt + 1
      , sCumulativesBuffer = cumulativesBuffer1 now
      }

    - ✅ Cannot withdraw more liquidity from a position than it currently has: $ setPosition cfmm liquidityDelta=10_000 (lowerTickIndex=-10, upperTickIndex=10)
                                                                               $ updatePosition cfmm liquidityProvider2 (-(toInteger liquidityDelta) - 1) 1
      expectFailedWith: positionLiquidityBelowZeroErr

    - ✅ Liquidity Providers earn fees from swaps: $ setPosition cfmm 1_e7 (-10000, 10000)
                                                   $ collectFees cfmm feeReceiver 0 liquidityProvider

      (feeReceiverBalanceX, feeReceiverBalanceY) <- balancesOf balanceConsumers feeReceiver
      -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
      feeReceiverBalanceX `isInRangeNat` (sum xFees) $ (1, 0)
      feeReceiverBalanceY `isInRangeNat` (sum yFees) $ (1, 0)

    - ✅ Liquidity Providers earn fees proportional to their liquidity: for_ [(liquidityProvider1, position1Liquidity), (liquidityProvider2,                position2Liquidity)]
                                                                        $ setPosition cfmm liquidity (-10_000, 10_000)
      collectFees cfmm feeReceiver1 0 liquidityProvider1
      collectFees cfmm feeReceiver2 1 liquidityProvider2
      (feeReceiver1BalanceX, feeReceiver1BalanceY) <- balancesOf balanceConsumers feeReceiver1
      (feeReceiver2BalanceX, feeReceiver2BalanceY) <- balancesOf balanceConsumers feeReceiver2

      -- Position 2 has triple the liquidity of Position 1,
      -- so `feeReceiver1` should get 1/4 of all earned fees and `feeReceiver2` should get 3/4.
      -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
      feeReceiver1BalanceX `isInRangeNat` (sum xFees `div` 4) $ (1, 0)
      feeReceiver1BalanceY `isInRangeNat` (sum yFees `div` 4) $ (1, 0)
      feeReceiver2BalanceX `isInRangeNat` (sum xFees * 3 `div` 4) $ (1, 0)
      feeReceiver2BalanceY `isInRangeNat` (sum yFees * 3 `div` 4) $ (1, 0)

      checkAllInvariants cfmm

    - ✅ Liquidity Providers do not receive past fees: $ setPosition cfmm 1_e7 (-10_000, 10_000) from liquidityProvider1
      (xFeesBefore, yFeesBefore) <- placeSwaps beforeSwaps
                                                       $ setPosition cfmm 1_e7 (-10_000, 10_000) from liquidityProvider2
      (xFeesBefore, yFeesBefore) <- placeSwaps beforeSwaps
      checkAllInvariants cfmm
                                                       $ collectFees cfmm feeReceiver1 0 liquidityProvider1
                                                       $ collectFees cfmm feeReceiver2 1 liquidityProvider2
      (feeReceiver1BalanceX, feeReceiver1BalanceY) <- balancesOf balanceConsumers feeReceiver1
      (feeReceiver2BalanceX, feeReceiver2BalanceY) <- balancesOf balanceConsumers feeReceiver2

      -- Fees from `beforeSwaps` should all go to Position 1.
      -- Fees from `afterSwaps` should be evenly split between Position 1 and Position 2.
      -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
      feeReceiver1BalanceX `isInRangeNat` (xFeesBefore + (xFeesAfter `div` 2)) $ (1, 0)
      feeReceiver1BalanceY `isInRangeNat` (yFeesBefore + (yFeesAfter `div` 2)) $ (1, 0)
      feeReceiver2BalanceX `isInRangeNat` (xFeesAfter `div` 2) $ (1, 0)
      feeReceiver2BalanceY `isInRangeNat` (yFeesAfter `div` 2) $ (1, 0)

      checkAllInvariants cfmm

    - ✅ Accrued fees are discounted when adding liquidity to an existing position: $ setPosition cfmm liquidityDelta (lowerTickIndex, upperTickIndex)
      (initialBalanceLpX, initialBalanceLpY) <- balancesOf balanceConsumers liquidityProvider
                                                                                    $ updatePosition cfmm feeReceiver (toInteger liquidityDelta) 0
       ( (finalBalanceLpX, finalBalanceFeeReceiverX),
        (finalBalanceLpY, finalBalanceFeeReceiverY))
        <- balancesOfMany balanceConsumers (liquidityProvider, feeReceiver)

      -- The fees earned during the swaps should be discounted from the
      -- tokens needed to make the deposit.
      -- Due to rounding, it's possible the LP will receive 1 fewer tokens than expected.
      st <- getStorage cfmm
      -- Note: Fees are rounded down when being distributed to LPs, so a margin of error of -1 is acceptable.
      -- Due to the floating-point math used in `liquidityDeltaToTokensDelta`, it's possible there
      -- will be an additional +/- 1 error.
      finalBalanceLpX `isInRangeNat` (initialBalanceLpX + xFees - fromIntegral @Integer @Natural xDelta) $ (2, 1)
      finalBalanceLpY `isInRangeNat` (initialBalanceLpY + yFees - fromIntegral @Integer @Natural yDelta) $ (2, 1)

      -- `feeReceiver` should not receive any fees.
      finalBalanceFeeReceiverX @== 0
      finalBalanceFeeReceiverY @== 0

    - ✅ Ticks' states are updated correctly when an overlapping position is created: -- Place a small swap to move the tick a little bit
                                                                                      -- and make sure `tick_cumulative` is not 0.

                                                                                    liquidityProvider $ inBatch do
                                                                                            setPosition cfmm liquidityDelta (ti1=0, ti3=100)
                                                                                            setPosition cfmm liquidityDelta (ti2=50, ti4=150)
                                                                                    swapper $ ytox cfmm 100 swapper
      -- Advance the time a few secs to make sure accumulators
      -- like `seconds_per_liquidity_cumulative` change to non-zero values.
      advanceSecs 2 [cfmm]
                                                                                    swapper $ ytox cfmm 1_000 swapper
      initialStorage <- getStorage cfmm
      initialState <- getBigMapValue (initialStorage & sTicksRPC) ti2
                                                                                    liquidityProvider $ setPosition cfmm liquidityDelta (ti2 ti3)
      -- Check that `ti2`'s state has been updated.
      finalStorage <- getStorage cfmm
      finalState <- getBigMapValue (finalStorage & sTicksRPC) ti2
      tsNPositions finalState @== tsNPositions initialState + 1
      tsLiquidityNet finalState @== tsLiquidityNet initialState + fromIntegral @Natural @Integer liquidityDelta
      tsSqrtPrice finalState @== tsSqrtPrice initialState

      -- Accumulators should stay unchanged.
      tsFeeGrowthOutside finalState @== tsFeeGrowthOutside initialState
      tsSecondsOutside finalState @== tsSecondsOutside initialState
      tsSecondsPerLiquidityOutside finalState @== tsSecondsPerLiquidityOutside initialState
      tsTickCumulativeOutside finalState @== tsTickCumulativeOutside initialState

    - ✅ Liquidating a position in small steps is (mostly) equivalent to doing it all at once: for_ [liquidityProvider1, liquidityProvider2]
                                                                                            $ setPosition cfmm liquidityDelta (-10_000, 10_000)
                                                                                            -- Liquidate the position all at once
                                                                                            liquidityProvider1 $ updatePosition cfmm receiver1 (-toInteger liquidityDelta) 0
                                                                                            liquidityProvider2 do
                                                                                            -- Doing all 10 calls in one batch may go over the gas limit,
                                                                                            -- so we do it in 2 batches of 5 instead.
                                                                                                replicateM_ 2 do
                                                                                                inBatch $ replicateM_ 5 do
                                                                                                    updatePosition cfmm receiver2 (- toInteger liquidityDelta `div` 10) 1
      ( (balanceReceiver1X, balanceReceiver2X),
        (balanceReceiver1Y, balanceReceiver2Y))
        <- balancesOfMany balanceConsumers (receiver1, receiver2)

      -- Liquidating in 10 smaller steps may lead
      -- to `receiver2` receiving up to 10 fewer tokens due to rounding errors.
      balanceReceiver2X `isInRangeNat` balanceReceiver1X $ (10, 0)
      balanceReceiver2Y `isInRangeNat` balanceReceiver1Y $ (10, 0)

    - ✅ forAllTokenTypeCombinations -- Positison is initialized correctly:
