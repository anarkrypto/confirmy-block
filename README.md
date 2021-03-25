# Confirmy Block

This is a experimental script to help confirm unconfirmed Nano transactions.

It doesn't always work, it depends on some factors like confirmation of the entire previous block chain and network status

#### Clone and install dependencies
```
    git clone https://github.com/anarkrypto/confirmy-block
    cd confirmy-blocks
    npm install
```

#### Config
Edit `config.json`, enter the address of a nano node and a valid worker. They can be the same

#### Usage:

```
    node src/index nano_account recent_blocks_count target_block(optional)
```

Example:

```
    node src/index nano_3jwrszth46rk1mu7rmb4rhm54us8yg1gw3ipodftqtikf5yqdyr7471nsg1k 1450
```


<br><br><br>

If it helped you, consider making a donation:

nano_37f4cm1tu94tteodph6xwwnoowhiae3q483kgfwzd75ns7tbp9uknot4qihe
