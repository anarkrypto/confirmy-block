# Confirmy Block

*************************************
### Mission Accomplished! archiving the repo

Confirmy-Block was a project created to help the community during the spam on Nano's network that generated desynchronization between nodes, preventing the confirmation of transactions.

Several community members joined the task force and together we were able to confirm between tens of thousands of transactions from users and major exchanges including Binance, Kraken, KuCoin and Huobi.

Thanks to everyone who was a part of it!

Read more at: https://www.reddit.com/r/nanocurrency/comments/nk7qcj/the_success_of_the_confirmy_block/

*************************************

This is a experimental script to help confirm unconfirmed Nano transactions.

- It fetches the first unconfirmed block, increases the PoW and republish it to the a list of public nodes, waits for confirmation from PRs and continues to the next block.
- If it detects that the block was confirmed during the new PoW process, it cancels the work and continue to the next block
- If something goes wrong it exit. So you need to run again
- If any receive block depends on another unconfirmed block (link), it gives up and exit. So you need to run again in the source account (it will be displayed)

I was successful in confirming hundreds of blocks from a Binance account, using https://rpc.p2pow.online as node, which is configured to show as "confirmed" only blocks with 67% quorum

This script may not work, especially if your account has a fork.

Also note that the network can not take long to confirm these new blocks and increase the PoW will not do any good!

If it takes too long to confirm and does not confirm, the most recommended is to wait.
You can check your block confirmation in nanocrawler.cc and nanolooker.com

!! If you insist on running the script many times, it will increase the difficulty of the Work and it may be impossible to increase it more in the future !!

#### Clone and install dependencies
```
    git clone https://github.com/anarkrypto/confirmy-block
    cd confirmy-block
    npm install
```

#### Config
Edit `config.json`:
- node: A valid and synced Nano node RPC. It can be a remote node, but it needs to support the following rpc calls: account_info, account_history, block_info, process 
- worker: Responsible for increase the PoW. It can be the same Nano node or a <a href="https://github.com/nanocurrency/nano-work-server">nano-work-server</a>. It is recommended to use GPU
- min_pending_amount: Minimum amount in mNano for pedentral blocks
- enable_active_difficulty: Use the active_difficulty (dynamic difficulty) of the network, if it is greater than the difficulty of the current block's PoW difficulty.
- min-consensus: Percentage of public nodes in the list (nodes.txt) that we want to wait for confirmation before going to the next block when used with --sync. Integer values from 0 to 100
- enable_max_difficulty: If you want to skip very large PoW, leave this option enabled (true). Otherwise false
- max_difficulty_send: Maximum PoW multiplier for send and change blocks [if enable_max_difficulty is true] 
- max_difficulty_receive: Maximum PoW multiplier for receive blocks [if enable_max_difficulty is true] 

#### If you are using your own node:

1. Add this lines to your `config-node.toml`, in the [node] section.
```
# Online weight minimum required to confirm a block.
# type:string,amount,raw
online_weight_minimum = "60000000000000000000000000000000000000"

# Percentage of votes required to confirm blocks. A value below 50 is not recommended.
# type:uint64
online_weight_quorum = 67
```
This will ensure that your node will only say that a block is confirmed when the 67% vote quorum has been reached

2. If you are using any proxy on your node, such as <a href="https://github.com/Joohansson/NanoRPCProxy" target="_blank">NanoRPCProxy</a>, be sure to activate the following commands (actions):
```
    account_info, account_history, blocks_info or block_info, pending, process, active_difficulty
```


### Usage:


#### [Recommended] Confirms all blocks in an account:

```console
    node src/index [nano_account] --sync --force --follow --min-consensus 90
```
Example:
```console
    node src/index nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe --sync --force --follow --min-consensus 90
```

```--sync```: Gets the lowest frontier from a list of public nodes (nodes.txt)

```--force```: Forces reconfirmation of blocks.

```--follow```: If a receiving block depends on another chain's confirmation, it automatically follows and confirms blocks from that chain. Without --follow the script will ask you whether you want it or not.

```--min-consensus```: Integer values from 0 to 100. Percentage of public nodes in the list (nodes.txt) that we want to wait for confirmation before going to the next block when used with --sync. 

<br>

#### Confirms all blocks in an account, starting from a specific block:

```console
    node src/index [nano_account] [head_block] --force --follow
```
Example:
```console
    node src/index nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe 311B4EF6724AE01E0B276A3219943A81C5C76378B581B2C1E6F946712C957699 --force --follow
```
<br>

#### Confirms only pending blocks (unpocketed blocks), synchronizing with other nodes:
```console
            node src/index [nano_account] --all-pending --only-pending --sync --force --follow
```
Example:
```console
            node src/index nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe --only-pending --all-pending --sync --force --follow
```

```--only-pending```: Attempts to confirm only pending blocks

```--all-pending```: When finding pending blocks (unpocketed), do not ask the user, try to confirm all

<br>

#### Confirms a specific block - only use this option if you are sure that all previous blocks are confirmed
```console
    node src/index [block_hash] --force
```
Option ```--force``` tries to update the block, even if the node says it is already confirmed

Example:
```console
    node src/index 311B4EF6724AE01E0B276A3219943A81C5C76378B581B2C1E6F946712C957699 --force --follow
```

<br>

<img src="https://github.com/anarkrypto/confirmy-block/blob/main/docs/confirmyblock.gif?raw=true">


<br><br>

If it helped you, consider making a donation :):

nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe
