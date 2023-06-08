
from unittest import TestCase
from pprint import pprint
from constants import *

from helpers import *
import copy

from pytezos import ContractInterface, MichelsonRuntimeError
from initial_storage import init_storage, factory, token_x_addr, token_y_addr
import math

def ify(num):
    return {"i" : num}

vr = {
    f"{factory}%get_owner": admin,
    f"{factory}%check_pause": False,
    f"{factory}%get_dev_fee": 5,
}

E18 = 10 ** 18
E36 = 10 ** 36


class SwapTest(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.maxDiff = None

        code = open("build/dex_core.tz").read()
        cls.dex = ContractInterface.from_michelson(code)

        # default_storage_text = open("out/storage_default.tz").read()
        
        # # remove parenthesis so pytezos michelson able to parse it
        # default_storage_text = default_storage_text.strip()
        # default_storage_text = default_storage_text[1:-1] 
        # # cls.dex.storage_from_michelson(default_storage_text)

        pprint(cls.dex.storage.dummy())

        cls.init_storage = init_storage

    def test_dex_tick_drain(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        # self.assertDictEqual(self.dex.storage.dummy(), self.init_storage)

        set_position = self.dex.set_position(
            lower_tick_index=-1,
            upper_tick_index=1,
            lower_tick_witness=-1048575,
            upper_tick_witness=-1048575,
            liquidity=100_000,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        )
        res = chain.execute(set_position)

        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 2)
        self.assertGreaterEqual(transfers[0]["amount"], 5) 
        self.assertGreaterEqual(transfers[0]["source"], me) 
        self.assertGreaterEqual(transfers[0]["destination"], contract_self_address) 
        self.assertGreaterEqual(transfers[1]["amount"], 5)
        self.assertGreaterEqual(transfers[1]["source"], me) 
        self.assertGreaterEqual(transfers[1]["destination"], contract_self_address) 

        res = chain.execute(self.dex.x_to_y(
            dx=100,
            deadline=FAR_FUTURE,
            min_dy=1,
            to_dy=me,
            referral_code=0,
        ))

        pprint(parse_transfers(res))

    def test_dex_set_position_cfmm(self):
        print("init storage")
        print(self.init_storage)
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        pprint(self.init_storage)

        set_position = self.dex.set_position(
            lower_tick_index=-1048575,
            upper_tick_index=1048575,
            lower_tick_witness=-1048575,
            upper_tick_witness=1048575,
            liquidity=100_000,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0
        )
        res = chain.execute(set_position)

        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 2)
        self.assertGreaterEqual(transfers[0]["amount"], 100_000) 
        self.assertGreaterEqual(transfers[0]["source"], me) 
        self.assertGreaterEqual(transfers[0]["destination"], contract_self_address) 
        self.assertGreaterEqual(transfers[1]["amount"], 100_000)
        self.assertGreaterEqual(transfers[1]["source"], me) 
        self.assertGreaterEqual(transfers[1]["destination"], contract_self_address) 

        res = chain.interpret(self.dex.x_to_y(
            dx=10_000,
            deadline=FAR_FUTURE,
            min_dy=1,
            to_dy=me,
            referral_code=0,
        ))

        print("x_to_y")
        pprint(parse_transfers(res))

        res = chain.interpret(self.dex.y_to_x(
            dy=10_000,
            deadline=FAR_FUTURE,
            min_dx=1,
            to_dx=me,
            referral_code=0,
        ))

        print("y_to_x")
        pprint(parse_transfers(res))

    def test_update_position(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        set_position = self.dex.set_position(
            lower_tick_index=-1048575,
            upper_tick_index=1048575,
            lower_tick_witness=-1048575,
            upper_tick_witness=1048575,
            liquidity=100_000,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        )
        res = chain.execute(set_position, sender=bob)
        # old_storage = res.storage

        update_position = self.dex.update_position(
            position_id=0,
            liquidity_delta=-100_000,
            to_x=bob,
            to_y=bob,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        )
        res = chain.execute(update_position, sender=bob)

        transfers = parse_transfers(res)
        self.assertEqual(transfers[0]["destination"], bob)
        self.assertEqual(transfers[1]["destination"], bob)

        # the position is deleted at this point, so no way to update it
        with self.assertRaises(MichelsonRuntimeError):
            update_position = self.dex.update_position(
                position_id=0,
                liquidity_delta=-100_000,
                to_x=me,
                to_y=me,
                deadline=FAR_FUTURE,
                maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
                referral_code=0,
            )
            res = chain.execute(update_position)

    
    def test_dex_set_position_stable_price(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        set_position = self.dex.set_position(
            lower_tick_index=-1,
            upper_tick_index=1,
            lower_tick_witness=-1048575,
            upper_tick_witness=-1048575,
            liquidity=2_000_000_000,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 1_000_000, "y" : 1_000_000},
            referral_code=0,
        )
        res = chain.execute(set_position)

        # pprint(parse_transfers(res))
        # pprint(res.storage)
        # return

        # transfers = parse_transfers(res)
        # self.assertEqual(len(transfers), 2)
        # self.assertGreaterEqual(transfers[0]["amount"], 100_000) 
        # self.assertGreaterEqual(transfers[0]["source"], me) 
        # self.assertGreaterEqual(transfers[0]["destination"], contract_self_address) 
        # self.assertGreaterEqual(transfers[1]["amount"], 100_000)
        # self.assertGreaterEqual(transfers[1]["source"], me) 
        # self.assertGreaterEqual(transfers[1]["destination"], contract_self_address) 
        # pprint(res.storage)

        res = chain.execute(self.dex.x_to_y(
            dx=100_000_000,
            deadline=FAR_FUTURE,
            min_dy=1,
            to_dy=me,
            referral_code=0,
        ))

        pprint(parse_transfers(res))



        # transfer = self.dex.transfer(
        #     [{ "from_" : alice,
        #         "txs" : [{
        #             "amount": 5_000,
        #             "to_": julian,
        #             "token_id": 0
        #         }]
        #     }])

        # res = chain.execute(transfer, sender=bob)

    def test_swap_full_tick_buy_fee(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        set_position = self.dex.set_position(
            lower_tick_index=-2,
            upper_tick_index=2,
            lower_tick_witness=-1048575,
            upper_tick_witness=-1048575,
            liquidity=int(1e52),
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : int(1e52), "y" : int(1e52)},
            referral_code=0,
        )
        res = chain.execute(set_position, sender=bob)

        transfers = parse_transfers(res)
        first_invest_total = sum(tx["amount"] for tx in transfers)

        print("first_invest_total", first_invest_total)

        set_position = self.dex.set_position(
            lower_tick_index=3,
            upper_tick_index=8,
            lower_tick_witness=-1048575,
            upper_tick_witness=-1048575,
            liquidity=int(1e52),
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : int(1e52), "y" : int(1e52)},
            referral_code=0,
        )
        res = chain.execute(set_position, sender=bob)
        
        transfers = parse_transfers(res)
        second_invest_total = sum(tx["amount"] for tx in transfers)

        print("ticks before")
        pprint(res.storage["cur_tick_index"])
        pprint(res.storage["ticks"])

        res = chain.execute(self.dex.x_to_y(
            dx=int(1e51),
            deadline=FAR_FUTURE,
            min_dy=1,
            to_dy=me,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        pprint(transfers)

        print("ticks after")
        pprint(res.storage["cur_tick_index"])
        pprint(res.storage["ticks"])

        update_position = self.dex.update_position(
            position_id=0,
            liquidity_delta=-int(1e52),
            to_x=bob,
            to_y=bob,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 1, "y" : 1},
            referral_code=0,
        )
        res = chain.execute(update_position, sender=bob)

        transfers = parse_transfers(res)
        pprint(transfers)

        divest_total = sum(tx["amount"] for tx in transfers)
        print("divest_total", divest_total)
        print("first invest total", first_invest_total)

        self.assertGreater(divest_total, first_invest_total)

    def test_equal_rewards(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 1_000_000_000)), sender=alice)

        transfers = parse_transfers(res)
        alice_invest_total = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 1_000_000_000)), sender=bob)

        transfers = parse_transfers(res)
        bob_invest_total = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.x_to_y(
            dx=100_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.y_to_x(
            dy=100_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.update_position(
            position_id=0,
            liquidity_delta=-1_000_000_000,
            to_x=alice,
            to_y=alice,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        ), sender=alice)

        transfers = parse_transfers(res)
        alice_divest_total = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.update_position(
            position_id=1,
            liquidity_delta=-1_000_000_000,
            to_x=bob,
            to_y=bob,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        ), sender=bob)

        transfers = parse_transfers(res)
        bob_divest_total = sum(tx["amount"] for tx in transfers)

        self.assertEqual(alice_invest_total, bob_invest_total)
        self.assertEqual(alice_divest_total, bob_divest_total)

    def test_multiple_small_investments(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        
        res = chain.execute(self.dex.set_position(form_set_position(-1, 1, 20000)), sender=alice)

        invested_total = 0

        transfers = parse_transfers(res)
        invested_total += sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.update_position(form_update_position(0, 10000, alice)), sender=alice)


        transfers = parse_transfers(res)
        invested_total += sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.update_position(form_update_position(0, -30000, alice)), sender=alice)
        transfers = parse_transfers(res)
        divested_total = sum(tx["amount"] for tx in transfers)
        self.assertLess(divested_total, invested_total)

    def test_update_position_zero(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 10_000_000_000)), sender=alice)

        res = chain.execute(self.dex.x_to_y(
            dx=300_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.y_to_x(
            dy=300_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.update_position(
            position_id=0,
            liquidity_delta=0,
            to_x=alice,
            to_y=alice,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        ), sender=alice)

        transfers = parse_transfers(res)
        self.assertAlmostEqual(transfers[0]["amount"], 300, delta=2)
        self.assertAlmostEqual(transfers[1]["amount"], 300, delta=2)

        res = chain.execute(self.dex.update_position(
            position_id=0,
            liquidity_delta=0,
            to_x=alice,
            to_y=alice,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        ), sender=alice)

        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 0)


    def test_swap_zero(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 10_000_000_000)), sender=bob)

        res = chain.execute(self.dex.x_to_y(
            dx=300_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.x_to_y(
            dx=300_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        old_storage = res.storage

        res = chain.execute(self.dex.x_to_y(
            dx=0, min_dy=0,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertDictEqual(res.storage, old_storage)

        res = chain.execute(self.dex.y_to_x(
            dy=0, min_dx=0,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertDictEqual(res.storage, old_storage)


    def test_liquidity_one(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 1)))

        transfers = parse_transfers(res)
        pprint(transfers)

        old_storage = res.storage

        res = chain.execute(self.dex.x_to_y(
            dx=1, min_dy=0,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        # self.assertDictEqual(old_storage, res.storage)

        transfers = parse_transfers(res)
        pprint(transfers)

        res = chain.execute(self.dex.update_position(
            position_id=0,
            liquidity_delta=-1,
            to_x=me,
            to_y=me,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        ))


        transfers = parse_transfers(res)
        pprint(transfers)

        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 1)))

        pprint(res.storage)



    def test_witness_always_prev(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        pprint(self.init_storage)

        set_position = self.dex.set_position(
            lower_tick_index=-1,
            upper_tick_index=1,
            lower_tick_witness=-1048575,
            upper_tick_witness=-1048575,
            liquidity=100_000,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 1_000_000, "y" : 1_000_000},
            referral_code=0,
        )
        res = chain.execute(set_position)

        res = chain.execute(self.dex.x_to_y(
            dx=10_000,
            deadline=FAR_FUTURE,
            min_dy=1,
            to_dy=me,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        pprint(res.storage)

    def test_no_previous_fees_for_position_below(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        # add some liquidity in the wide range
        res = chain.execute(self.dex.set_position(form_set_position(-100, 100, 10_000_000_000)), sender=alice)
    
        # add position in the narrow range below current tick
        res = chain.execute(self.dex.set_position(form_set_position(-8, -4, 10_000_000_000)), sender=alice)

        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.x_to_y(
            dx=3_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        # pprint(res.storage["cur_tick_index"])
        # we are now in range of narrow position
        self.assertEqual(res.storage["cur_tick_index"], -5)

        res = chain.execute(self.dex.update_position(form_update_position(1, -10_000_000_000, alice)), sender=alice)

        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        print("total", total_invested, total_divested)

        # we expect more was divested since some fee was earned
        self.assertGreater(total_divested, total_invested)

        res = chain.execute(self.dex.y_to_x(
            dy=3_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))
        
        self.assertEqual(res.storage["cur_tick_index"], 0)

        res = chain.execute(self.dex.set_position(form_set_position(-8, -4, 10_000_000_000)), sender=alice)
        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        pprint(res.storage)

        res = chain.execute(self.dex.update_position(form_update_position(2, -10_000_000_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        # we expect almost the same amount is divested
        self.assertLessEqual(total_divested, total_invested)

    def test_no_previous_fees_for_position_above(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        # add some liquidity in the wide range
        res = chain.execute(self.dex.set_position(form_set_position(-100, 100, 10_000_000_000)), sender=alice)
    
        # add position in the narrow range below current tick
        res = chain.execute(self.dex.set_position(form_set_position(4, 8, 10_000_000_000)), sender=alice)

        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.y_to_x(
            dy=3_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        # we are now in range of narrow position
        self.assertEqual(res.storage["cur_tick_index"], 4)

        res = chain.execute(self.dex.update_position(form_update_position(1, -10_000_000_000, alice)), sender=alice)

        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        print("total", total_invested, total_divested)

        # we expect more was divested since some fee was earned
        self.assertGreater(total_divested, total_invested)

        self.assertNotIn(4, res.storage["ticks"])
        self.assertNotIn(8, res.storage["ticks"])

        res = chain.execute(self.dex.x_to_y(
            dx=3_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))
        
        self.assertEqual(res.storage["cur_tick_index"], -1)

        res = chain.execute(self.dex.set_position(form_set_position(4, 8, 10_000_000_000)), sender=alice)
        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        pprint(res.storage)
        pprint(transfers)

        res = chain.execute(self.dex.update_position(form_update_position(2, -10_000_000_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        pprint(transfers)

        # we expect almost the same amount is divested
        self.assertLessEqual(total_divested, total_invested)

    def test_alt_no_previous_fees_for_position_above(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        # add some liquidity in the wide range
        res = chain.execute(self.dex.set_position(form_set_position(-100, 100, 10_000_000_000)), sender=alice)
    
        # add position in the narrow range below current tick
        res = chain.execute(self.dex.set_position(form_set_position(4, 8, 10_000_000_000)), sender=alice)

        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers) 


        res = chain.execute(self.dex.y_to_x(
            dy=3_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.x_to_y(
            dx=3_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], -1)

        res = chain.execute(self.dex.update_position(form_update_position(1, -10_000_000_000, alice)), sender=alice)

        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        print("total", total_invested, total_divested)

        # we expect more was divested since some fee was earned
        self.assertGreater(total_divested, total_invested)

        self.assertNotIn(4, res.storage["ticks"])
        self.assertNotIn(8, res.storage["ticks"])

        self.assertEqual(res.storage["cur_tick_index"], -1)

        res = chain.execute(self.dex.set_position(form_set_position(4, 8, 10_000_000_000)), sender=alice)
        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        pprint(res.storage)
        pprint(transfers)

        res = chain.execute(self.dex.update_position(form_update_position(2, -10_000_000_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        pprint(transfers)

        # we expect almost the same amount is divested
        self.assertLessEqual(total_divested, total_invested)

    def test_no_previous_fees_for_inside_position(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 10_000_000_000)), sender=alice)

        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.x_to_y(
            dx=300_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))
    
        res = chain.execute(self.dex.update_position(form_update_position(0, -10_000_000_000, alice)), sender=alice)

        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        # we expect more was divested since some fee was earned
        self.assertGreater(total_divested, total_invested)

        transfers = parse_transfers(res)
        pprint(transfers)

        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 10_000_000_000)), sender=alice)

        transfers = parse_transfers(res)
        total_invested = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.update_position(form_update_position(1, -10_000_000_000, alice)), sender=alice)

        transfers = parse_transfers(res)
        total_divested = sum(tx["amount"] for tx in transfers)

        # we expect almost the same amount is divested
        self.assertLessEqual(total_divested, total_invested)


    def test_dev_fee_inside_single_tick(self):
        dev_fee_vr = copy.deepcopy(vr)
        # take the half of the fee for dramatic effect
        dev_fee_vr[f"{factory}%get_dev_fee"] = 5000
        chain = LocalChain(storage=self.init_storage, default_view_results=dev_fee_vr)

        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 100_000_000_000)), sender=alice)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 2, 100_000_000_000)), sender=bob)

        transfers = parse_transfers(res)

        self.assertEqual(res.storage["sqrt_price"], 1208925819614629174706176)

        res = chain.execute(self.dex.x_to_y(
            dx=3_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["sqrt_price"], 1208907704132682746455221)

        res = chain.execute(self.dex.y_to_x(
            dy=3_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.update_position(form_update_position(0, -10_000_000_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        # these values are (original cfmm out - 1500 / 2)
        self.assertEqual(transfers[0]["amount"], 1000701)
        self.assertEqual(transfers[1]["amount"], 1000696)
        
        res = chain.execute(self.dex.claim_dev_fee(admin), sender=admin, view_results=vr)
        transfers = parse_transfers(res)
        self.assertEqual(transfers[0]["amount"], 1500)
        self.assertEqual(transfers[1]["amount"], 1500)

        res = chain.execute(self.dex.update_position(form_update_position(1, -10_000_000_000, bob)), sender=bob)
        transfers = parse_transfers(res)
        self.assertEqual(transfers[0]["amount"], 1000701)
        self.assertEqual(transfers[1]["amount"], 1000696)

    def test_dev_fee_across_ticks(self):
        dev_fee_vr = copy.deepcopy(vr)
        # take the half of the fee for dramatic effect
        dev_fee_vr[f"{factory}%get_dev_fee"] = 5000
        chain = LocalChain(storage=self.init_storage, default_view_results=dev_fee_vr)

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 100_000_000_000)), sender=alice)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 100_000_000_000)), sender=bob)

        transfers = parse_transfers(res)

        res = chain.execute(self.dex.x_to_y(
            dx=10_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], -2)
        
        res = chain.execute(self.dex.y_to_x(
            dy=20_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], 1)

        total_x = 0
        total_y = 0

        res = chain.execute(self.dex.update_position(form_update_position(0, -100_000_000_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        print("alice out")
        pprint(transfers)
        total_x += transfers[1]["amount"]
        total_y += transfers[0]["amount"]
        
        res = chain.execute(self.dex.claim_dev_fee(admin), sender=admin, view_results=vr)
        transfers = parse_transfers(res)
        print("dev fee")
        pprint(transfers)
        total_x += transfers[1]["amount"]
        total_y += transfers[0]["amount"]

        self.assertAlmostEqual(transfers[0]["amount"], 10_000, delta=1)
        self.assertAlmostEqual(transfers[1]["amount"], 5_000, delta=1)

        res = chain.execute(self.dex.update_position(form_update_position(1, -100_000_000_000, bob)), sender=bob)
        transfers = parse_transfers(res)
        print("bob out")
        pprint(transfers)
        total_x += transfers[1]["amount"]
        total_y += transfers[0]["amount"]

        print("total x", total_x, "total_y", total_y)
        self.assertAlmostEqual(total_x, 19500, delta=1)
        self.assertAlmostEqual(total_y, 20010495, delta=1)
        
        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 100_000_000_000)), sender=alice)
        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 100_000_000_000)), sender=bob)
        transfers = parse_transfers(res)
        bob_invest_total = sum(tx["amount"] for tx in transfers)
        pprint(transfers)

        # all dev fees was claimed nontheless
        res = chain.execute(self.dex.claim_dev_fee(admin), sender=admin, view_results=vr)
        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 0)

        # intepret bob divesting 
        res = chain.interpret(self.dex.update_position(form_update_position(3, -100_000_000_000, bob)), sender=bob)
        transfers = parse_transfers(res)
        pprint(transfers)
        bob_divest_total = sum(tx["amount"] for tx in transfers)
        self.assertAlmostEqual(bob_invest_total, bob_divest_total, delta=1)

        res = chain.execute(self.dex.x_to_y(
            dx=10_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.execute(self.dex.y_to_x(
            dy=10_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        pprint(transfers)

    def test_price_change_directions(self):
        dev_fee_vr = copy.deepcopy(vr)
        # take the half of the fee for dramatic effect
        dev_fee_vr[f"{factory}%get_dev_fee"] = 5000
        chain = LocalChain(storage=self.init_storage, default_view_results=dev_fee_vr)

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 1_000_000_000)), sender=alice)

        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 1_000_000_000)), sender=bob)

        # res = chain.execute(self.dex.x_to_y(
        #     dx=1_000_000 * E36, min_dy=1,
        #     to_dy=me, deadline=FAR_FUTURE,
        referral_code=0,
        # ))

        res = chain.execute(self.dex.y_to_x(
            dy=20_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        print("alice out")
        pprint(transfers)

        sqrt_price = res.storage["sqrt_price"]
        print("price sqrt", ((sqrt_price * sqrt_price) >> 80) / 80)

    def test_self_to_self_transfer_position_ids(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 1_000_000_000)), sender=alice)

        # res = chain.execute(self.dex.transfer([{
        #     "from_" : alice,
        #     "txs" : [{
        #         "amount": 1,
        #         "to_": alice,
        #         "token_id": 0
        #     }]
        # }]), sender=alice)

        pprint(res.storage)

    def test_huge_swaps(self):
        dev_fee_vr = copy.deepcopy(vr)
        # take the half of the fee for dramatic effect
        dev_fee_vr[f"{factory}%get_dev_fee"] = 5000
        chain = LocalChain(storage=self.init_storage, default_view_results=dev_fee_vr)

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 1_000_000_000 * E36)), sender=alice)

        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 1_000_000_000 * E36)), sender=bob)

        res = chain.execute(self.dex.x_to_y(
            dx=100_000 * E36, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        pprint(transfers)

        self.assertEqual(res.storage["cur_tick_index"], -2)
        
        res = chain.execute(self.dex.y_to_x(
            dy=200_000 * E36, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], 1)

        total_x = 0
        total_y = 0

        res = chain.execute(self.dex.update_position(form_update_position(0, -1_000_000_000 * E36, alice)), sender=alice)
        transfers = parse_transfers(res)
        print("alice out")
        pprint(transfers)
        total_x += transfers[1]["amount"]
        total_y += transfers[0]["amount"]
        
        res = chain.execute(self.dex.claim_dev_fee(admin), sender=admin, view_results=vr)
        transfers = parse_transfers(res)
        print("dev fee")
        pprint(transfers)
        total_x += transfers[1]["amount"]
        total_y += transfers[0]["amount"]

        self.assertAlmostEqual(transfers[0]["amount"], 100 * E36, delta=E36)
        self.assertAlmostEqual(transfers[1]["amount"], 50 * E36, delta=E36)

        res = chain.execute(self.dex.update_position(form_update_position(1, -1_000_000_000 * E36, bob)), sender=bob)
        transfers = parse_transfers(res)
        print("bob out")
        pprint(transfers)
        total_x += transfers[1]["amount"]
        total_y += transfers[0]["amount"]

        print("total x", total_x, "total_y", total_y)
        self.assertAlmostEqual(total_x, 195 * E36, delta=E36)
        self.assertAlmostEqual(total_y, 200105 * E36, delta=E36)\

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 1_000_000_000 * E36)), sender=alice)
        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 1_000_000_000 * E36)), sender=bob)
        transfers = parse_transfers(res)
        bob_invest_total = sum(tx["amount"] for tx in transfers)

        # all dev fees was claimed nontheless
        res = chain.execute(self.dex.claim_dev_fee(admin), sender=admin, view_results=vr)
        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 0)

        # intepret bob divesting 
        res = chain.interpret(self.dex.update_position(form_update_position(3, -1_000_000_000 * E36, bob)), sender=bob)
        transfers = parse_transfers(res)
        bob_divest_total = sum(tx["amount"] for tx in transfers)
        self.assertAlmostEqual(bob_invest_total, bob_divest_total, delta=1)

        # res = chain.execute(self.dex.x_to_y(
        #     dx=10_000_000, min_dy=1,
        #     to_dy=me, deadline=FAR_FUTURE
        referral_code=0,
        # ))

        res = chain.execute(self.dex.y_to_x(
            dy=100_000 * E36, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        pprint(transfers)

    def test_max_tick_spacing(self):
        const_max_tick = 1048575
        storage = copy.deepcopy(self.init_storage)
        storage["constants"]["tick_spacing"] = const_max_tick
        chain = LocalChain(storage=storage, default_view_results=vr)

        set_position = self.dex.set_position(
            lower_tick_index=-1048575,
            upper_tick_index=1048575,
            lower_tick_witness=-1048575,
            upper_tick_witness=1048575,
            liquidity=100_000,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : 100_000, "y" : 100_000},
            referral_code=0,
        )
        res = chain.execute(set_position)

        with self.assertRaises(MichelsonRuntimeError):
            set_position = self.dex.set_position(form_set_position(-2, 2, 1))
            res = chain.execute(set_position)

        with self.assertRaises(MichelsonRuntimeError):
            set_position = self.dex.set_position(form_set_position(-const_max_tick+1, const_max_tick-1, 1))
            res = chain.execute(set_position)

        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 2)
        self.assertGreaterEqual(transfers[0]["amount"], 100_000) 
        self.assertGreaterEqual(transfers[0]["source"], me) 
        self.assertGreaterEqual(transfers[0]["destination"], contract_self_address) 
        self.assertGreaterEqual(transfers[1]["amount"], 100_000)
        self.assertGreaterEqual(transfers[1]["source"], me) 
        self.assertGreaterEqual(transfers[1]["destination"], contract_self_address) 

        res = chain.interpret(self.dex.x_to_y(
            dx=10_000,
            deadline=FAR_FUTURE,
            min_dy=1,
            to_dy=me,
            referral_code=0,
        ))

        print("x_to_y")
        pprint(parse_transfers(res))

        res = chain.interpret(self.dex.y_to_x(
            dy=10_000,
            deadline=FAR_FUTURE,
            min_dx=1,
            to_dx=me,
            referral_code=0,
        ))

        print("y_to_x")
        pprint(parse_transfers(res))

    def test_zero_tick_spacing(self):
        storage = copy.deepcopy(self.init_storage)
        storage["constants"]["tick_spacing"] = 0
        chain = LocalChain(storage=storage)

        # fails due to `MOD by 0`
        with self.assertRaises(MichelsonRuntimeError): 
            set_position = self.dex.set_position(form_set_position(-2, 2, 1))
            chain.execute(set_position)

    def test_maximum_tokens_contributed(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 1_000_000)), sender=alice, view_results=vr)

        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 1_000_000)), sender=bob, view_results=vr)

        res = chain.interpret(self.dex.update_position(
            position_id=0,
            liquidity_delta=-1_000_000,
            to_x=alice,
            to_y=alice,
            deadline=FAR_FUTURE,
            maximum_tokens_contributed={"x" : -99, "y" : 0},
            referral_code=0,
        ), sender=alice, view_results=vr)

        transfers = parse_transfers(res)
        self.assertEqual(transfers[0]["amount"], 99)

        with self.assertRaises(MichelsonRuntimeError):
            res = chain.interpret(self.dex.update_position(
                position_id=0,
                liquidity_delta=-1_000_000,
                to_x=alice,
                to_y=alice,
                deadline=FAR_FUTURE,
                maximum_tokens_contributed={"x" : -100, "y" : 0},
                referral_code=0,
            ), sender=alice, view_results=vr)

        with self.assertRaises(MichelsonRuntimeError):
            res = chain.interpret(self.dex.update_position(
                position_id=0,
                liquidity_delta=1_000_000,
                to_x=alice,
                to_y=alice,
                deadline=FAR_FUTURE,
                maximum_tokens_contributed={"x" : -100_000_000, "y" : 0},
                referral_code=0,
            ), sender=alice, view_results=vr)

    def test_repeated_adding_with_miniscule_liq(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        init_liq = int(1e55)

        set_position = self.dex.set_position(form_set_position(-1, 1, init_liq))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        # res = chain.execute(self.dex.x_to_y(
        #     dx=3,
        #     deadline=FAR_FUTURE,
        #     min_dy=0,
        #     to_dy=me,
        # referral_code=0,
        # ))

        res = chain.execute(self.dex.y_to_x(
            dy=3,
            deadline=FAR_FUTURE,
            min_dx=0,
            to_dx=me,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        small_liq = 1

        iters = 10
        for _ in range(iters):
            res = chain.execute(self.dex.update_position(form_update_position(0, small_liq, alice)), sender=alice)

            transfers = parse_transfers(res)
            chain.apply_transfers(transfers)

        total_liq = iters * small_liq + init_liq
        res = chain.execute(self.dex.update_position(form_update_position(0, -total_liq, alice)), sender=alice)

        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        pprint(chain.tokens)
        # self.assertGreaterEqual(chain.tokens[token_y_addr][alice], -11) # Bob loses no more than one token per iteration
        
    def test_repeated_adding_of_liquidity(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        liq = int(1e55)

        set_position = self.dex.set_position(form_set_position(-1, 1, liq))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        print("alice initial investment")
        pprint(transfers)

        chain.apply_transfers(transfers)

        print("---------------------")

        set_position = self.dex.set_position(form_set_position(0, 1, liq))
        res = chain.execute(set_position, sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        # res = chain.execute(self.dex.x_to_y(
        #     dx=2,
        #     deadline=FAR_FUTURE,
        #     min_dy=0,
        #     to_dy=me,
        referral_code=0,
        # ))

        res = chain.execute(self.dex.y_to_x(
            dy=5,
            deadline=FAR_FUTURE,
            min_dx=0,
            to_dx=me,
            referral_code=0,
        ))

        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        iters = 10
        for _ in range(iters):
            res = chain.execute(self.dex.update_position(form_update_position(1, liq, bob)), sender=bob)

            transfers = parse_transfers(res)
            chain.apply_transfers(transfers)

        res = chain.execute(self.dex.update_position(form_update_position(1, (-iters - 1) * liq, bob)), sender=bob)

        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        pprint(chain.tokens)
        self.assertGreaterEqual(chain.tokens[token_y_addr][bob], -11) # Bob loses no more than one token per iteration


    def test_x_overdraft(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        liq = int(1e35)

        set_position = self.dex.set_position(form_set_position(-1, 1, liq))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        print("alice initial investment")
        pprint(transfers)

        chain.apply_transfers(transfers)

        print("---------------------")

        set_position = self.dex.set_position(form_set_position(-1, 0, liq))
        res = chain.execute(set_position, sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        x_in = transfers[0]["amount"]
        y_in = 0
        if len(transfers) > 1:
            y_in = transfers[1]["amount"]
            assert transfers[1]["token_address"] == token_y_addr

        pprint(transfers)


        print("tick index before", res.storage['cur_tick_index'])

        res = chain.execute(self.dex.x_to_y(
            dx=5,
            deadline=FAR_FUTURE,
            min_dy=0,
            to_dy=me,
            referral_code=0,
        ))


        print("x_to_y")
        transfers = parse_transfers(res)
        pprint(transfers)

        chain.apply_transfers(transfers)

        x_out = transfers[0]["amount"]
        assert transfers[0]["destination"] == contract_self_address
        if len(transfers) > 1:
            y_in += transfers[1]["amount"]
            assert transfers[1]["token_address"] == token_y_addr


        print("tick index after", res.storage['cur_tick_index'])

        res = chain.execute(self.dex.update_position(form_update_position(1, -liq, bob)), sender=bob)

        transfers = parse_transfers(res)
        pprint(transfers)
        chain.apply_transfers(transfers)


        x_out = transfers[0]["amount"]
        y_out = 0
        if len(transfers) > 1:
            y_out = transfers[1]["amount"]
            assert transfers[1]["token_address"] == token_y_addr

        print("x in", x_in)
        print("x out", x_out)
        print("x in sub out", x_in - x_out)

        print("y in", y_in)
        print("y out", y_out)
        print("y in sub out", y_in - y_out)

        res = chain.execute(self.dex.update_position(form_update_position(0, -liq, alice)), sender=alice)
        transfers = parse_transfers(res)
        pprint(transfers)
        chain.apply_transfers(transfers)

        pprint(chain.tokens)

        self.assertGreaterEqual(chain.tokens[token_x_addr][contract_self_address], 0)
        self.assertGreaterEqual(chain.tokens[token_y_addr][contract_self_address], 0)


    def test_y_overdraft(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        liq = int(1e105)

        set_position = self.dex.set_position(form_set_position(-1, 1, liq))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        pprint(res.operations)
        print("alice initial investment")
        pprint(transfers)

        chain.apply_transfers(transfers)

        print("---------------------")

        set_position = self.dex.set_position(form_set_position(0, 1, liq))
        res = chain.execute(set_position, sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        x_in = transfers[0]["amount"]
        y_in = 0
        if len(transfers) > 1:
            y_in = transfers[1]["amount"]
            assert transfers[1]["token_address"] == token_y_addr

        invested = sum(tx["amount"] for tx in transfers)
        print("invested", invested)
        pprint(transfers)

        print("tick index before", res.storage['cur_tick_index'])

        res = chain.execute(self.dex.y_to_x(
            dy=5,
            deadline=FAR_FUTURE,
            min_dx=0,
            to_dx=me,
            referral_code=0,
        ))

        print("y_to_x")
        transfers = parse_transfers(res)
        pprint(transfers)

        chain.apply_transfers(transfers)

        x_out = transfers[1]["amount"]
        y_in += transfers[0]["amount"]
        assert transfers[0]["token_address"] == token_y_addr
        assert transfers[0]["destination"] == contract_self_address


        print("tick index after", res.storage['cur_tick_index'])

        res = chain.execute(self.dex.update_position(form_update_position(1, -liq, bob)), sender=bob)

        transfers = parse_transfers(res)
        divested = sum(tx["amount"] for tx in transfers)
        print("divested", divested)
        pprint(transfers)
        chain.apply_transfers(transfers)


        x_out = transfers[0]["amount"]
        y_out = 0
        if len(transfers) > 1:
            y_out = transfers[1]["amount"]
            assert transfers[1]["token_address"] == token_y_addr

        print("x in", x_in)
        print("x out", x_out)
        print("x in sub out", x_in - x_out)

        print("y in", y_in)
        print("y out", y_out)
        print("y in sub out", y_in - y_out)

        res = chain.execute(self.dex.update_position(form_update_position(0, -liq, alice)), sender=alice)
        transfers = parse_transfers(res)
        pprint(transfers)
        chain.apply_transfers(transfers)

        pprint(chain.tokens)

        self.assertGreater(chain.tokens[token_x_addr][contract_self_address], 0)
        self.assertGreater(chain.tokens[token_y_addr][contract_self_address], 0)

    def test_minimal_liquidity_update(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        liq = int(1)

        set_position = self.dex.set_position(form_set_position(-1, 0, liq))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        res = chain.execute(self.dex.update_position(form_update_position(0, -liq, alice)), sender=alice)

        transfers = parse_transfers(res)

        chain.apply_transfers(transfers)

        pprint(chain.tokens)

    def test_no_tx_when_removing_zero_liq(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        liq = int(1_000_000)

        set_position = self.dex.set_position(form_set_position(-100_000, 100_000, liq))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        set_position = self.dex.set_position(form_set_position(-10, -5, liq))
        res = chain.execute(set_position, sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        set_position = self.dex.set_position(form_set_position(5, 10, liq))
        res = chain.execute(set_position, sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        res = chain.execute(self.dex.update_position(form_update_position(0, 0, alice)), sender=alice)

        transfers = parse_transfers(res)
        self.assertEqual(len(transfers), 0)

    def test_update_position_zero_after_swap(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)
        liq = int(1)

        set_position = self.dex.set_position(form_set_position(-7134, 1, 400_000))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)
        pprint(transfers)

        res = chain.execute(self.dex.x_to_y(
            dx=20100,
            deadline=FAR_FUTURE,
            min_dy=0,
            to_dy=me,
            referral_code=0,
        ))
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        res = chain.interpret(self.dex.update_position(form_update_position(0, -400_000, alice)), sender=alice)
        transfers = parse_transfers(res)

        full_divest = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.update_position(form_update_position(0, 0, alice)), sender=alice)
        transfers = parse_transfers(res)

        fee_divest = sum(tx["amount"] for tx in transfers)

        res = chain.execute(self.dex.update_position(form_update_position(0, -400_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        
        divest = sum(tx["amount"] for tx in transfers)

        self.assertAlmostEqual(full_divest, fee_divest + divest, delta=1)

    def test_update_position_zero_updates(self):
        lvr = vr.copy()
        lvr[f"{factory}%get_dev_fee"] = 5000
        print(lvr)

        init_storage = copy.deepcopy(self.init_storage)
        init_storage["constants"]["fee_bps"] = 200

        chain = LocalChain(storage=init_storage, default_view_results=lvr)

        chain.advance_blocks(0)
        chain.advance_blocks(1)
        chain.advance_blocks(1)

        set_position = self.dex.set_position(form_set_position(-514, 256, 8388738))
        res = chain.execute(set_position, sender=alice)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        res = chain.execute(self.dex.claim_dev_fee(admin), sender=admin)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        set_position = self.dex.set_position(form_set_position(0, 393472, 15923))
        res = chain.execute(set_position, sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        res = chain.execute(self.dex.y_to_x(
            dy=5550,
            deadline=FAR_FUTURE,
            min_dx=0,
            to_dx=me,
            referral_code=0,
        ))

        res = chain.execute(self.dex.update_position(form_update_position(1, 0, bob)), sender=bob)
        transfers = parse_transfers(res)
        chain.apply_transfers(transfers)

        pprint(res.storage)
        pprint(transfers)

    def test_optimal_fee(self):
        lvr = vr.copy()
        lvr[f"{factory}%get_dev_fee"] = 3000

        init_storage = copy.deepcopy(self.init_storage)
        init_storage["constants"]["fee_bps"] = 30
        init_storage["constants"]["tick_spacing"] = 1

        max_x = 0
        cur_x = 0
        max_i = 0
        max_j = 0

        for i in range(0, 10, 5):
            for j in range(0, 10, 5):
                chain = LocalChain(storage=init_storage, default_view_results=lvr)

                res = chain.execute(self.dex.set_position(form_set_position(-600, 600, 100_000_000_000)), sender=alice)
                
                # transfers = parse_transfers(res)
                # pprint(transfers)
                # return
                # 2_955_446_646

                # print("cur_tick_index before", res.storage["cur_tick_index"])

                res = chain.execute(self.dex.set_position(form_set_position(-i - j - 1, -i, 100_000_000_000)), sender=bob)
                transfers = parse_transfers(res)
                print("bob point invest")
                pprint(transfers)

                res = chain.execute(self.dex.x_to_y(
                    dx=1_000_000_000, min_dy=1,
                    to_dy=me, deadline=FAR_FUTURE,
                    referral_code=0,
                ))

                transfers = parse_transfers(res)

                res = chain.execute(self.dex.update_position(form_update_position(1, -100_000_000_000, bob)), sender=bob)

                transfers = parse_transfers(res)

                idx = 0 if transfers[0]["token_address"] == token_x_addr else 1
                amount = transfers[idx]["amount"]
                if amount > max_x:
                    max_i = i
                    max_j = j
                    max_x = amount

                print("bob point divest")
                pprint(transfers)

        print("max_x", max_x)
        print("max_i", max_i)
        print("max_j", max_j)

        return
        

        print("cur_tick_index after", res.storage["cur_tick_index"])
        return

        self.assertEqual(res.storage["cur_tick_index"], -2)
        
        res = chain.execute(self.dex.y_to_x(
            dy=20_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], 1)

        total_x = 0
        total_y = 0

        res = chain.execute(self.dex.update_position(form_update_position(0, -100_000_000_000, alice)), sender=alice)
        transfers = parse_transfers(res)
        print("alice out")
        pprint(transfers)
        total_x += transfers[0]["amount"]
        total_y += transfers[1]["amount"]

    def test_fees_current_tick_above_both_upper_and_lower(self):
        chain = LocalChain(storage=init_storage, default_view_results=vr)

        res = chain.execute(self.dex.set_position(form_set_position(-6000, 6000, 1_000_000_000_000)), sender=bob)
        res = chain.execute(self.dex.set_position(form_set_position(-600, 600, 100_000_000_000)), sender=alice)
        
        
        res = chain.interpret(self.dex.y_to_x(
            dy=200_000_000_000, deadline=FAR_FUTURE,
            min_dx=1, to_dx=me,
            referral_code=0,
        ))

        res = chain.execute(self.dex.x_to_y(
            dx=10_000_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.interpret(self.dex.y_to_x(
            dy=100_000_000_000, deadline=FAR_FUTURE,
            min_dx=1, to_dx=me,
            referral_code=0,
        ))


        transfers = parse_transfers(res)
        pprint(res.storage["cur_tick_index"])

        pprint(res.storage)

        try:
            res = chain.execute(self.dex.update_position(form_update_position(1, -100_000_000_000, alice)), sender=bob)
        except Exception as e:
            error_code = e.args[-1]
            print("error_code", error_code)

        transfers = parse_transfers(res)

        pprint(transfers)