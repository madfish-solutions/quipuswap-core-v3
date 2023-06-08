
from unittest import TestCase
from copy import deepcopy
from pprint import pprint
from collections import defaultdict
from constants import *

from helpers import *

from pytezos import ContractInterface, MichelsonRuntimeError

import hypothesis.strategies as st
from hypothesis import settings, assume, event
from hypothesis.stateful import Bundle, RuleBasedStateMachine, rule, initialize, invariant, consumes, precondition

from math import isclose

from initial_storage import init_storage, factory

import random

MIN_TICK = -1048575

tick_index_st = st.integers(min_value=MIN_TICK, max_value=1048575)

vr = {
    f"{factory}%get_owner": admin,
    f"{factory}%check_pause": False,
    f"{factory}%get_dev_fee": 5000,
}

@st.composite
def lower_and_upper_tick(draw):
    upper = draw(st.integers(min_value=MIN_TICK, max_value=1048575))
    max_lower = max(MIN_TICK, upper - 1)
    lower = draw(st.integers(min_value=MIN_TICK, max_value=max_lower))
    return (lower, upper)

def get_init_tick_lower_than(tick_index, init_ticks):
    if init_ticks == []:
        return -1048575
    lower_ticks = list(filter(lambda x: x < tick_index, init_ticks))
    return random.choice(lower_ticks)

USERS = [alice,bob,carol]

class StatefulTest(RuleBasedStateMachine):

    last_position = 0
    fees_approx = 0

    def __init__(self):
        super().__init__()

        self.positions = defaultdict(lambda: [])
        self.last_position = 0
        self.fees_approx = 0
        self.ledger = defaultdict(int)
        self.init_ticks = []

        text = open("build/dex_core.tz").read()
        self.ct = ContractInterface.from_michelson(text)

        self.init_storage = deepcopy(init_storage)
        self.init_storage["constants"]["fee_bps"] = 200

        self.chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        print("New example")

    positions = Bundle("positions")


    @rule(
        target=positions,
        ticks=lower_and_upper_tick(),
        liquidity=st.integers(min_value=1),
        user=st.sampled_from(USERS),
        )
    def set_position(self, ticks, liquidity, user):
        try:
            lower_tick_index, upper_tick_index = ticks
            lower_tick_witness = get_init_tick_lower_than(lower_tick_index, self.init_ticks)
            upper_tick_witness = get_init_tick_lower_than(upper_tick_index, self.init_ticks)
            print('set position')
            print(lower_tick_index, lower_tick_witness, upper_tick_index, upper_tick_witness, liquidity, user)
            set_position = self.ct.set_position(
                lower_tick_index=lower_tick_index,
                upper_tick_index=upper_tick_index,
                lower_tick_witness=lower_tick_witness,
                upper_tick_witness=upper_tick_witness,
                liquidity=liquidity,
                deadline=FAR_FUTURE,
                maximum_tokens_contributed={"x" : int(1e52), "y" : int(1e52)}
            )
            res = self.chain.execute(set_position, sender=user)
            transfers = parse_transfers(res)
            tokens_total = sum(tx["amount"] for tx in transfers) 

            pos = {
                "pos_id": res.storage["new_position_id"] - 1,
                "liquidity": liquidity,
                "tokens_total": tokens_total,
                "user": user,
            }
            
            self.last_position += 1

            self.chain.apply_transfers(transfers)
            
            return pos

        except MichelsonRuntimeError as error:
            # event("set position failed")
            print(error)
            assume(False)
            # raise Exception("set position failed")

    @rule(
        blocks=st.integers(min_value=0, max_value=10)
    )
    def advance_time(self, blocks):
        self.chain.advance_blocks(blocks)

    @rule(
        target=positions,
        position=consumes(positions),
        direction=st.integers(-1, 1),
    )
    def update_position(self, position, direction):
        try:
            print("update position", position, direction)
            user = position["user"]
            liquidity = position["liquidity"] * direction
            res = self.chain.execute(self.ct.update_position(form_update_position(position["pos_id"], liquidity, user)), sender=user)
            transfers = parse_transfers(res)

            unsigned_tokens_total = sum(tx["amount"] for tx in transfers)

            sign = -1 if liquidity < 0 else 1
            tokens_total = unsigned_tokens_total * sign

            old_liq = position["liquidity"]
            old_tokens_total = position["tokens_total"]

            self.chain.apply_transfers(transfers)
            
            return {
                "pos_id": position["pos_id"],
                "liquidity": old_liq + liquidity,
                "tokens_total": old_tokens_total + tokens_total,
                "user": user,
            }

        except MichelsonRuntimeError as e:
            error_code = e.args[-1]
            if error_code in ["311", "312", "316", "317"]:
                raise e
            else:
                event("update position failed")
                assume(False)

    @precondition(lambda self: self.last_position > 0)
    @rule(
        amount=st.integers(min_value=0)
    )
    def swap_x_to_y(self, amount):
        try:
            print("swap x to y", amount)
            sqrt_price_before = self.chain.storage["sqrt_price"]

            res = self.chain.execute(self.ct.x_to_y(
                dx=amount,
                deadline=FAR_FUTURE,
                min_dy=0,
                to_dy=me
            ))
            transfers = parse_transfers(res)
            self.chain.apply_transfers(transfers)

            total = sum(tx["amount"] for tx in transfers)
            fees_approx = total * res.storage["constants"]["fee_bps"] / 10000
            self.fees_approx += fees_approx

            sqrt_price_after = self.chain.storage["sqrt_price"]
            if amount == 0:
                assert sqrt_price_before == sqrt_price_after

        except MichelsonRuntimeError:
            event("x to y failed")
            assume(False)

    @precondition(lambda self: self.last_position > 0)
    @rule(
        amount=st.integers(min_value=0)
    )
    def swap_y_to_x(self, amount):
        try:

            sqrt_price_before = self.chain.storage["sqrt_price"]

            res = self.chain.execute(self.ct.y_to_x(
                dy=amount,
                deadline=FAR_FUTURE,
                min_dx=0,
                to_dx=me
            ))

            transfers = parse_transfers(res)
            self.chain.apply_transfers(transfers)

            total = sum(tx["amount"] for tx in transfers)
            fees_approx = total * res.storage["constants"]["fee_bps"] / 10000
            self.fees_approx += fees_approx

            sqrt_price_after = self.chain.storage["sqrt_price"]
            if amount == 0:
                assert sqrt_price_before == sqrt_price_after

        except MichelsonRuntimeError:
            event("y to x failed")
            assume(False)

    @precondition(lambda self: self.last_position > 0)
    @rule()
    def tickMap(self):
        tick_map = self.chain.storage["ticks"]
        prevs = [tick["prev"] for tick in tick_map.values()]
        nexts = [tick["next"] for tick in tick_map.values()]

        assert list(tick_map.keys()) == sorted(tick_map.keys())
        assert prevs == sorted(prevs)
        assert nexts == sorted(nexts)

    @precondition(lambda self: self.last_position > 0)
    @rule()
    def current_tick_not_witness(self):
        assert self.chain.storage["cur_tick_index"] >= self.chain.storage["cur_tick_witness"]

    @precondition(lambda self: self.last_position > 0)
    @rule()
    def claim_dev_fee(self):
        vr = {
            f"{factory}%get_owner": admin
        }

        res = self.chain.execute(self.ct.claim_dev_fee(admin), sender=admin)

        transfers = parse_transfers(res)
        self.chain.apply_transfers(transfers)

        res = ""
        for tx in transfers:
            print(f"claim dev fee {tx['amount']} of token add {tx['token_address']}")


    # @precondition(lambda self: self.last_position > 0)
    # @rule(
    #     position=positions,
    # )
    # def drain_position(self, position):
    #     assume(position["liquidity"] > 0)
    #     print("drain position", position)
    #     liquidity = position["liquidity"]
    #     user = position["user"]
    #     pos_id = position["pos_id"]
    #     res = self.chain.interpret(self.ct.update_position(form_update_position(pos_id, -liquidity, user)), sender=user)
    #     transfers = parse_transfers(res)
    #     tokens_out = sum(tx["amount"] for tx in transfers)
    #     tokens_in = position["tokens_total"]
    #     if tokens_in > tokens_out:
    #         assert isclose(tokens_out, tokens_in, abs_tol=5)
        # else:
            # out is larger but no more than total fees
            # kinda useless check since 
            # assert isclose(tokens_out, tokens_in, abs_tol=self.fees_approx + 2)


    @precondition(lambda self: self.last_position > 0)
    @invariant()
    def balance_never_negative(self):
        # as seen in initial storage
        token_x_addr = "KT1MwKGYWWbXtfYdnQfwspwz5ZGfqGwiJuQF"
        token_y_addr = "KT1CB5JBSC7kTxRV3ir2xsooMA1FLieiD4Mt"

        token_x_ledger = self.chain.tokens[token_x_addr]
        token_y_ledger = self.chain.tokens[token_y_addr]

        print("contract token x ledger", token_x_ledger[contract_self_address])
        print("contract token y ledger", token_y_ledger[contract_self_address])

        assert token_x_ledger[contract_self_address] >= 0
        assert token_y_ledger[contract_self_address] >= 0


# uncomment to run stateful tests

# StatefulTest.TestCase.settings = settings(
#     max_examples=200, stateful_step_count=30, deadline=None
# )
# StatefulTestCase = StatefulTest.TestCase
