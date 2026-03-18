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
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      if (!window.freighter) {
        throw new Error("Freighter wallet not installed. Get it at freighter.app");
      }
      const connected = await window.freighter.isConnected();
      if (!connected) throw new Error("Please unlock your Freighter wallet");

      const key = await window.freighter.getPublicKey();
      setPublicKey(key);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setPublicKey(null), []);

  return { publicKey, connecting, error, connect, disconnect };
}
