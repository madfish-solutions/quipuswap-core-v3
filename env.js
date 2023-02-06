import { accounts } from './sandbox/accounts';

export default {
  confirmationPollingTimeoutSecond: 500000,
  syncInterval: 0, // 0 for tests, 5000 for deploying
  confirmTimeout: 90000, // 90000 for tests, 180000 for deploying
  buildDir: 'build',
  migrationsDir: 'migrations',
  contractsDir: 'contracts/main',
  ligoVersion: '0.54.1',
  network: 'development',
  networks: {
    development: {
      rpc: 'http://localhost:8732',
      network_id: '*',
      secretKey: accounts.alice.sk,
      factoryOwner: 'tz1dNhPvn8KmnYGV97G55bzDqnvJt6K2dVwf',
      pools: {
        0: {
          name: 'USDt/wTEZ',
          tickIndex: -1325,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        1: {
          name: 'USDt/tzBTC',
          tickIndex: -100357,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o',
            },
          },
          tokenY: {
            fa12: 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn',
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        2: {
          name: 'wTEZ/tzBTC',
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          tickIndex: -98860,
          tokenY: {
            fa12: 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn',
          },

          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        3: {
          name: 'wTEZ/QUIPU',
          tickIndex: 11263,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT193D4vozYnhGJQVtw7CoxxqphqUEEwK6Vb',
            },
          },

          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
      },
    },
    ghostnet: {
      rpc: 'https://rpc.ghostnet.teztnets.xyz',
      port: 443,
      network_id: '*',
      secretKey: accounts.dev.sk,
      factoryOwner: 'tz1dNhPvn8KmnYGV97G55bzDqnvJt6K2dVwf',
      pools: {
        0: {
          name: 'wTEZ/USDt',
          tickIndex: 1325,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1Bm3wGXRYUnrmbUSBbosZDUSFaWuZeBCev',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        1: {
          name: 'USDt/tzBTC',
          tickIndex: -100357,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1Bm3wGXRYUnrmbUSBbosZDUSFaWuZeBCev',
            },
          },
          tokenY: {
            fa12: 'KT1LJ4YjQkDkiPhazyV7PizE1t59K5wNGxLA',
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        2: {
          name: 'wTEZ/tzBTC',
          tickIndex: -98860,
          tokenY: {
            fa12: 'KT1LJ4YjQkDkiPhazyV7PizE1t59K5wNGxLA',
          },

          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        3: {
          name: 'wTEZ/QUIPU',
          tickIndex: 11263,
          tokenY: {
            fa12: 'KT1GG8Zd5rUp1XV8nMPRBY2tSyVn6NR5F4Q1',
          },

          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1L8ujeb25JWKa4yPB61ub4QG2NbaKfdJDK',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
      },
    },
    mainnet: {
      rpc: 'https://mainnet.api.tez.ie',
      port: 443,
      network_id: '*',
      secretKey: accounts.mainnetDeployer.sk,
      factoryOwner: 'tz1dNhPvn8KmnYGV97G55bzDqnvJt6K2dVwf',
      pools: {
        0: {
          name: 'USDt/wTEZ',
          tickIndex: -1325,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o',
            },
          },

          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        1: {
          name: 'USDt/tzBTC',
          tickIndex: -100357,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o',
            },
          },
          tokenY: {
            fa12: 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn',
          },
          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        2: {
          name: 'wTEZ/tzBTC',
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          tickIndex: -98860,
          tokenY: {
            fa12: 'KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn',
          },

          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
        3: {
          name: 'wTEZ/QUIPU',
          tickIndex: 11263,
          tokenX: {
            fa2: {
              token_id: 0,
              token_address: 'KT1UpeXdK6AJbX58GJ92pLZVCucn2DR8Nu4b',
            },
          },
          tokenY: {
            fa2: {
              token_id: 0,
              token_address: 'KT193D4vozYnhGJQVtw7CoxxqphqUEEwK6Vb',
            },
          },

          feeBPS: 30,
          extraSlots: 100,
          tickSpacing: 60,
        },
      },
    },
  },
};
