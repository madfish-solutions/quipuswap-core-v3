
from unittest import TestCase
from pprint import pprint
from constants import *

from helpers import *
import copy

from pytezos import ContractInterface, MichelsonRuntimeError
from initial_storage import init_storage, factory

def ify(num):
    return {"i" : num}


vr = {
    f"{factory}%get_owner": admin,
    f"{factory}%check_pause": False,
    f"{factory}%get_dev_fee": 5000,
}


E18 = 10 ** 18
E36 = 10 ** 36


class CumsTest(TestCase):

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

        cls.init_storage = init_storage

    def test_cumulative_simple(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 100_000_000_000)), sender=alice)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 100_000_000_000)), sender=bob)

        res = chain.execute(self.dex.x_to_y(
            dx=10_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], -2)

        chain.advance_blocks(2)
        
        res = chain.execute(self.dex.y_to_x(
            dy=20_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        res = chain.callback_view(self.dex.snapshot_cumulatives_inside(
            lower_tick_index = -2,
            upper_tick_index = 2,
            callback = None
        ))

        pprint(res)

    def test_observe_price(self):
        chain = LocalChain(storage=self.init_storage, default_view_results=vr)

        res = chain.execute(self.dex.increase_observation_count(3))

        res = chain.execute(self.dex.set_position(form_set_position(0, 2, 100_000_000_000)), sender=alice)
        
        res = chain.execute(self.dex.set_position(form_set_position(-2, 0, 100_000_000_000)), sender=bob)

        chain.advance_blocks(1)

        res = chain.execute(self.dex.x_to_y(
            dx=10_000_000, min_dy=1,
            to_dy=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        self.assertEqual(res.storage["cur_tick_index"], -2)

        chain.advance_blocks(2)
        
        res = chain.execute(self.dex.y_to_x(
            dy=20_000_000, min_dx=1,
            to_dx=me, deadline=FAR_FUTURE,
            referral_code=0,
        ))

        for i in range(3):
            chain.advance_blocks(1)

            res = chain.execute(self.dex.x_to_y(
                dx=10_000_000, min_dy=1,
                to_dy=me, deadline=FAR_FUTURE,
                referral_code=0,
            ))


            chain.advance_blocks(1)
            
            res = chain.execute(self.dex.y_to_x(
                dy=10_000_000, min_dx=1,
                to_dx=me, deadline=FAR_FUTURE,
                referral_code=0,
            ))

        pprint(res.storage["cumulatives_buffer"])

        # res = chain.callback_view(self.dex.observe(
        #     times=[240],
        #     callback=None
        # ))

        # pprint(res)


    def test_odd_range_cumulatives(self):
        pass