### Smart Router for Tinyman, Algofi and Pactfi pools

This module leverages a TEAL contract and NodeJs to find the best quotes and route orders appropriately.
Current limitations on target pool contracts ( Teal < v6 means contract to contract calls are unsupported ) forces me to exit early from my contract, and do the routing in NodeJs.

Algorand's next protocol upgrade should include the ability to make contract to contract calls for all > v4 contracts. Once this happens Algofi and Pactfi will support quote-to-swap atomic smart routing, Tinyman will still require the trade being sent from the front-end, due to its app + LogicSig design.

The logic for Algofi and Pactfi swap is already written in the contracts, I have simply added a bypass, to be removed once the protocol upgrades.

### Installation

`npm install router_hackalgo`

**Python** must also be installed on your machine.  
When a quote is routed to Tinyman, the module needs to retrieve the LogicSig of the corresponding Tinyman pool. Node will spawn a child process and run the python script from the Tinyman py sdk to get it.

This is an ESM module.

### Usage and high level explanation

This module runs on testnet.

A router class is instantiated with the relevant trading pair and the user's mnemomic

```js
const router = new Router(asset1, asset2, mnemo);
```

Using the mnemo will allow us to route the order immediately after the contract returns without additional time getting a user to sign off on transactions.

The router now needs to lookup Tinyman, Algofi and Pactfi for pools corresponding to that asset pair.

```js
await router.loadPools();
```

Swapping is then done with:

```js
await router.swap({ amount: 500, asset: 10458941, slippage: 50 });
```

With amount in microunits of the asset, asset being the asset that is being sent to trade and slippage the tolerance in basis points (50 = 0.5%) from the quote we get.

At this point, opt-ins will be sent if the router or the user need one. To get the router to opt-in an asset, on top of the appl call, 0.1 Algo are sent to its account to compensate for the increased minimum balance requirement.

The contract is then called with the relevant `accounts`, `foreignApps` and `foreignAssets`. Pool fees are also sent in `appArgs`, as both Algofi and Pactfi have many fee tiers for their pools, and the contract needs to be made aware of it to get an accurate quote.  
The asset will be also sent to the contract.

At this point the contract gets a quote for each of the marketplaces and determines the optimal one.

This is where we have to return as we cannot yet send the trade from the contract.  
Here the contract sends back the asset to the user. It also logs the quotes, which are fetched back in NodeJs. The trade to the best marketplace is sent immediately, as instructed by the contract output.

### Example

```js
import Router from "router_hackalgo";

const asset1 = 0; // Algo
const asset2 = 10458941; // USDC;
const mnemo = "your 25 words";

try {
  const router = new Router(asset1, asset2, mnemo);
  await router.loadPools();
  await router.swap({ amount: 500, asset: asset1, slippage: 50 });
} catch (error) {
  console.error(error.message);
}
```

Output:

```
Your quote for 500 microAlgos against asset n°10458941
Tinyman quote: 1012, Algofi quote: 980, Pactfi quote: 315
Best quote from: Tinyman
Swapped 500 microAlgos for 1006 token n°10458941 on Tinyman
```

And the reverse trade:

```
Your quote for 500 of asset n° 10458941 against microAlgos
Tinyman quote: 245, Algofi quote: 252, Pactfi quote: 786
Best quote from: Pactfi
Swapped 500 of asset n° 10458941 for 786 microAlgos on Pactfi
```

---

### ABI

#### Smart routing

tx 0 : Pay / axfer, swap amount to the router address

tx 1 : NoOp appl call

- appArgs: [ assetOut ID, algofi pool fee in basis points, pactfi pool fee in basis points ]
- accounts: [ tinymanPool ?? zeroAddress, algofiPool ?? zeroAddress, pactfiPool ?? zeroAddress ]
- foreignAssets: [ asset-in, asset-out ] // Algo = 0
- foreignApps: [ tinyman validator app, algofi.app ?? 0, pactfi.app ?? 0 ]
- appIndex: router app

tx 2 : NoOp appl call

- fee : minFee \* 5 (tbd)
- appArgs: [ minimum amount out ]
- accounts: [ algofiPool ?? zeroAddress, pactfiPool ?? zeroAddress ]
- foreignAssets: [ asset-in, asset-out ] // Algo = 0
- foreignApps: [ algofi.app ?? 0, pactfi.app ?? 0, algofi manager app ]
- appIndex: router app

#### Router opt-in

tx 0 : Pay

- amount: Assets array length \* 10 \*\* 5
- to : router address

tx 1 : NoOp appl call

- appArgs: [ "optIn" ]
- foreignAssets : Assets as number[]
- appIndex: router app
