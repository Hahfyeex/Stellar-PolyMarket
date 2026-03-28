"use client";

import { useEffect, useState } from "react";

interface AuditLog {
  id: number;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  ipfs_cid: string | null;
  on_chain_hash: string | null;
  timestamp: string;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch(`${API_URL}/api/audit-logs`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setLogs(data.auditLogs);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-400 text-sm">Loading audit logs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
        <p className="text-red-400 text-sm">Failed to load audit logs: {error}</p>
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400 text-sm">No audit logs found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-300">
        <thead className="text-xs uppercase bg-gray-800 text-gray-400">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Details</th>
            <th className="px-4 py-3">Timestamp</th>
            <th className="px-4 py-3">IPFS CID</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="px-4 py-3 font-mono">{log.id}</td>
              <td className="px-4 py-3 font-mono text-xs truncate max-w-[120px]" title={log.actor}>
                {log.actor}
              </td>
              <td className="px-4 py-3">
                <span className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded text-xs">
                  {log.action}
                </span>
              </td>
              <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={JSON.stringify(log.details)}>
                {JSON.stringify(log.details)}
              </td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {log.ipfs_cid ? (
                  <a
                    href={`${IPFS_GATEWAY}/${log.ipfs_cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline truncate block max-w-[140px]"
                    title={log.ipfs_cid}
                  >
                    {log.ipfs_cid}
                  </a>
                ) : (
                  <span className="text-gray-500">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
