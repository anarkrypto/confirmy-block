# Confirmy Block

This is a experimental script to help confirm unconfirmed Nano transactions.

- It fetches the first unconfirmed block, increases the PoW and retransmits it to the network, waits for confirmation and continues to the next block.
- If something goes wrong it exit.
- If any receive block depends on another unconfirmed block (link), it gives up and exit

I was successful in confirming several blocks from a Binance account, using my own node and later verifying the confirmations on nanocrawler.cc and nanolooker.com

But it doesn't always work, it depends on some factors like confirmation of the entire previous block chain and network status



#### Clone and install dependencies
```
    git clone https://github.com/anarkrypto/confirmy-block
    cd confirmy-blocks
    npm install
```

#### Config
Edit `config.json`:
- node: A valid and synced Nano node RPC. It can be a remote node, but it needs to support the following rpc calls: account_info, account_history, block_info, process 
- worker: Responsible for increase the PoW. It can be the same Nano node or a nano-work-server. It is recommended to use GPU
- enable_max_difficulty: If you want to skip very large PoW, leave this option enabled (true). Otherwise false
- max_difficulty_send: Maximum PoW multiplier for send and change blocks [if enable_max_difficulty is true] 
- max_difficulty_receive: Maximum PoW multiplier for receive blocks [if enable_max_difficulty is true] 

#### Usage:

```
    node src/index nano_account
```

Example:

```
    node src/index nano_3jwrszth46rk1mu7rmb4rhm54us8yg1gw3ipodftqtikf5yqdyr7471nsg1k
```

<br>

<img src="https://github.com/anarkrypto/confirmy-block/blob/main/docs/confirmyblock.gif?raw=true">


<br><br>

If it helped you, consider making a donation:

nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe
