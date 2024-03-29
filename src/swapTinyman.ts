import {
  assignGroupID,
  makeApplicationNoOpTxnFromObject,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  makePaymentTxnWithSuggestedParamsFromObject,
  mnemonicToSecretKey,
  signLogicSigTransactionObject,
  Transaction,
  waitForConfirmation,
} from "algosdk";
import { algoD } from "./adapters/algoD.js";
import { tinyValidatorApp } from "./constants/constants.js";
import getTinyLSig from "./helpers/getTinyLSig.js";
import { Swap } from "./types/types.js";

const enc = new TextEncoder();

interface SwapTinyman extends Swap {
  tinyPool: string;
  tinyLT: number;
}

export const swapTinyman = async ({
  assetIn,
  amount,
  suggestedParams,
  tinyPool,
  assetOut,
  tinyLT,
  minAmountOut,
  mnemo,
}: SwapTinyman): Promise<void> => {
  const account = mnemonicToSecretKey(mnemo);
  const lsig = await getTinyLSig([assetIn, assetOut]);

  const tx0 = makePaymentTxnWithSuggestedParamsFromObject({
    suggestedParams,
    from: account.addr,
    to: tinyPool,
    amount: 2000,
  });

  const tx1 = makeApplicationNoOpTxnFromObject({
    suggestedParams,
    from: tinyPool,
    appIndex: tinyValidatorApp,
    appArgs: [enc.encode("swap"), enc.encode("fi")],
    accounts: [account.addr],
    foreignAssets: [assetIn, assetOut, tinyLT],
  });

  let tx2: Transaction;
  if (assetIn === 0) {
    tx2 = makePaymentTxnWithSuggestedParamsFromObject({
      suggestedParams,
      from: account.addr,
      to: tinyPool,
      amount,
    });
  } else {
    tx2 = makeAssetTransferTxnWithSuggestedParamsFromObject({
      suggestedParams,
      from: account.addr,
      to: tinyPool,
      assetIndex: assetIn,
      amount,
    });
  }

  let tx3: Transaction;
  if (assetOut === 0) {
    tx3 = makePaymentTxnWithSuggestedParamsFromObject({
      suggestedParams,
      from: tinyPool,
      to: account.addr,
      amount: minAmountOut,
    });
  } else {
    tx3 = makeAssetTransferTxnWithSuggestedParamsFromObject({
      suggestedParams,
      from: tinyPool,
      to: account.addr,
      assetIndex: assetOut,
      amount: minAmountOut,
    });
  }

  const transactions = [tx0, tx1, tx2, tx3];
  assignGroupID(transactions);
  const t0 = tx0.signTxn(account.sk);
  const t1 = signLogicSigTransactionObject(tx1, lsig);
  const t2 = tx2.signTxn(account.sk);
  const t3 = signLogicSigTransactionObject(tx3, lsig);
  await algoD.sendRawTransaction([t0, t1.blob, t2, t3.blob]).do();
  const transactionResponse = await waitForConfirmation(algoD, t3.txID, 5);
  const { aamt: amountOut, amt: algoOut, xaid } = transactionResponse.txn.txn;
  console.log(
    `Swapped ${amount} ${assetIn === 0 ? "microAlgos" : `of asset n° ${assetIn}`} for ${amountOut ?? algoOut} ${
      xaid ? `token n°${xaid}` : "microAlgos"
    } on Tinyman`
  );
};
export default swapTinyman;
