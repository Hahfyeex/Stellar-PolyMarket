import { useState, useCallback } from "react";

declare global {
  interface Window {
    freighter?: {
      getPublicKey: () => Promise<string>;
      isConnected: () => Promise<boolean>;
      signTransaction: (xdr: string, opts?: object) => Promise<string>;
    };
  }
}

export function useWallet() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setWalletError(null);
    try {
      if (!window.freighter) {
        setWalletError("Freighter wallet not installed. Get it at freighter.app");
        setIsLoading(false);
        return;
      }

      const connected = await window.freighter.isConnected();
      if (!connected) {
        setWalletError("Please unlock your Freighter wallet");
        setIsLoading(false);
        return;
      }

      // Wrap getPublicKey in its own try/catch to handle user rejections specifically
      try {
        const key = await window.freighter.getPublicKey();
        setPublicKey(key);
      } catch (err: unknown) {
        // Freighter SDK often throws a string error on user rejection
        const message =
          typeof err === "string" ? err : (err as any)?.message ?? String(err);
        const isRejection = /user rejected|denied/i.test(message);

        setWalletError(
          isRejection
            ? "Connection cancelled. Click Connect Wallet to try again."
            : "Failed to connect wallet. Please try again."
        );
      }
    } catch (err: unknown) {
      setWalletError("Failed to connect wallet. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => setPublicKey(null), []);

  return { publicKey, isLoading, walletError, connect, disconnect };
}
