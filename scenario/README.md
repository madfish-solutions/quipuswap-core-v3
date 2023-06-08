# Scenario tests in Pytezos

## Prerequisites

Install cryptographic libraries according to your system following the instructions here:
https://pytezos.org/quick_start.html#requirements

## Requirements

```
python3 -m pip install pytezos pytest
```

## Building Contracts
```
yarn compile
```

## Running
```
python3 -m pytest -svk .
```

To run a specific test use:

```
python3 -m pytest -svk <test_name>
```

## Stateful tests

For this test `hypothesis` has to be installed:

```
python3 -m pip install hypothesis
```

Then uncomment last lines in `test_no_negative_balance.py`

And run as described above. Be aware it might take a long time (30+ min)


