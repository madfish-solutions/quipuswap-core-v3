import json

def parse_lambdas(path):
    lambdas = {}
    entries = json.load(open(path))
    for i in range(len(entries)):
        entry = entries[i]
        lambdas[i] = entry

    return lambdas

factory = "KT1ENB6j6uMJn7MtDV4VBE1AAAwCXmMtzjUd"
token_x_addr = "KT1MwKGYWWbXtfYdnQfwspwz5ZGfqGwiJuQF"
token_y_addr = "KT1CB5JBSC7kTxRV3ir2xsooMA1FLieiD4Mt"

init_storage = {
  'token_metadata': {},
  'constants': {
               'fee_bps': 10,
               'tick_spacing': 1,
               'token_x': {
                    'fa12': token_x_addr
               },
               'token_y': {
                    'fa2': {
                        'token_address': token_y_addr,
                        'token_id': 0,
                    }
               },
               'factory_address': factory
               },
 'cumulatives_buffer': {'first': 0,
                        'last': 0,
                        'map': {0: {'spl': {'block_start_liquidity_value': 0,
                                            'sum': 0},
                                    'tick': {'block_start_value': 0, 'sum': 0},
                                    'time': 0}},
                        'reserved_length': 1},
 'cur_tick_index': 0,
 'cur_tick_witness': -1048575,
 'fee_growth': {'x': 0, 'y': 0},
 'dev_fee' : {'x': 0, 'y': 0},
 'ladder': {(0, False): {'offset': -84, 'v': 19341845997356488514015570},
            (0, True): {'offset': -85, 'v': 38687560557337355742483221},
            (1, False): {'offset': -81, 'v': 2417609866154190654524678},
            (1, True): {'offset': -85, 'v': 38689494983725479307861971},
            (2, False): {'offset': -85, 'v': 38677889876083546261210550},
            (2, True): {'offset': -85, 'v': 38693364126677775184793561},
            (3, False): {'offset': -85, 'v': 38670155071614559132217310},
            (3, True): {'offset': -85, 'v': 38701103573421987005215721},
            (4, False): {'offset': -84, 'v': 19327345051392939314248854},
            (4, True): {'offset': -85, 'v': 38716587111352494729706462},
            (5, False): {'offset': -84, 'v': 19311889358453304431405214},
            (5, True): {'offset': -85, 'v': 38747572773653928660613512},
            (6, False): {'offset': -86, 'v': 77124060166079386301517011},
            (6, True): {'offset': -85, 'v': 38809618513447185627569983},
            (7, False): {'offset': -85, 'v': 38438828813936263312862610},
            (7, True): {'offset': -85, 'v': 38934008210058939100663682},
            (8, False): {'offset': -86, 'v': 76387211720013513967242610},
            (8, True): {'offset': -85, 'v': 39183984934869404935943141},
            (9, False): {'offset': -86, 'v': 75415686436335201065707301},
            (9, True): {'offset': -85, 'v': 39688763633815974521145659},
            (10, False): {'offset': -86, 'v': 73509547540888574991368714},
            (10, True): {'offset': -85, 'v': 40717912888646086984030507},
            (11, False): {'offset': -84, 'v': 17460146398643019245576278},
            (11, True): {'offset': -85, 'v': 42856962434838368098529959},
            (12, False): {'offset': -87, 'v': 126085780994910985395717054},
            (12, True): {'offset': -85, 'v': 47478079282778087338933597},
            (13, False): {'offset': -87, 'v': 102735988268212419722671870},
            (13, True): {'offset': -84, 'v': 29134438707490415855866100},
            (14, False): {'offset': -87, 'v': 68208042073114503830679361},
            (14, True): {'offset': -84, 'v': 43882733799120415566608322},
            (15, False): {'offset': -88, 'v': 60130046442422405275353178},
            (15, True): {'offset': -83, 'v': 49778031622173924435819796},
            (16, False): {'offset': -88, 'v': 11682706336100247487260846},
            (16, True): {'offset': -80, 'v': 32025492072892644517427309},
            (17, False): {'offset': -95, 'v': 56449132412055094618915006},
            (17, True): {'offset': -76, 'v': 53023938993515524338629870},
            (18, False): {'offset': -103, 'v': 20592303012757789234393034},
            (18, True): {'offset': -66, 'v': 36338278329035183585718600},
            (19, False): {'offset': -118, 'v': 1370156647050591448120178},
            (19, True): {'offset': -47, 'v': 34133361681864713959105863}},
 'liquidity': 0,
 'metadata': {},
 'new_position_id': 0,
 'operators': {},
 'positions': {},
 'position_ids': {},
 'sqrt_price': 1208925819614629174706176,
 'ticks': {-1048575: {'fee_growth_outside': {'x': 0, 'y': 0},
                      'liquidity_net': 0,
                      'n_positions': 1,
                      'next': 1048575,
                      'prev': -1048576,
                      'seconds_outside': 0,
                      'seconds_per_liquidity_outside': 0,
                      'sqrt_price': 20,
                      'tick_cumulative_outside': 0},
           1048575: {'fee_growth_outside': {'x': 0, 'y': 0},
                     'liquidity_net': 0,
                     'n_positions': 1,
                     'next': 1048576,
                     'prev': -1048575,
                     'seconds_outside': 0,
                     'seconds_per_liquidity_outside': 0,
                     'sqrt_price': 71107673757466966990985103421469892397199512717,
                     'tick_cumulative_outside': 0}}}