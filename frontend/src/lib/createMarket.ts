import { validateStellarAddress } from "./stellar";

export interface CreateMarketTransactionInput {
  walletAddress: string;
  marketId: number;
  question: string;
  outcomes: string[];
  endDateTime: string;
  tokenAddress: string;
}

export async function invokeCreateMarketOnChain({
  walletAddress,
  marketId,
  question,
  outcomes,
  endDateTime,
  tokenAddress,
}: CreateMarketTransactionInput): Promise<void> {
  if (!validateStellarAddress(walletAddress)) {
    throw new Error("Connect a valid Freighter wallet before signing.");
  }

  if (!validateStellarAddress(tokenAddress)) {
    throw new Error("Enter a valid Stellar token address before signing.");
  }

  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
  if (!contractId) {
    throw new Error("Missing NEXT_PUBLIC_CONTRACT_ID for on-chain market creation.");
  }

  const {
    SorobanRpc,
    TransactionBuilder,
    Networks,
    BASE_FEE,
    Address,
    nativeToScVal,
    contract,
  } = await import("@stellar/stellar-sdk");

  const rpcUrl =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SOROBAN_RPC_URL) ||
    "https://soroban-testnet.stellar.org";
  const server = new SorobanRpc.Server(rpcUrl);
  const account = await server.getAccount(walletAddress);
  const deadlineUnix = Math.floor(new Date(endDateTime).getTime() / 1000);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      // @ts-ignore SDK contract helper is available at runtime
      contract.contractInvocation({
        contractId,
        method: "create_market",
        args: [
          new Address(walletAddress).toScVal(),
          nativeToScVal(BigInt(marketId), { type: "u64" }),
          nativeToScVal(question),
          nativeToScVal(outcomes),
          nativeToScVal(BigInt(deadlineUnix), { type: "u64" }),
          new Address(tokenAddress).toScVal(),
          nativeToScVal(10_000_000n, { type: "i128" }),
          nativeToScVal(null),
          nativeToScVal(null),
        ],
      })
    )
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);

  if (!window.freighter) {
    throw new Error("Freighter wallet not installed");
  }

  const signedXdr = await window.freighter.signTransaction(prepared.toXDR(), {
    network: "TESTNET",
  });
  const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  const submitted = await server.sendTransaction(signedTx);

  if ("errorResultXdr" in submitted && submitted.errorResultXdr) {
    throw new Error("On-chain market creation failed");
  }
}
