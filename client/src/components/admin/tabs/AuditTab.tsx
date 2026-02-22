import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../../utils/api/admin';

const PAGE_SIZE = 50;

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

export const AuditTab: React.FC = () => {
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', offset],
    queryFn: () => adminApi.getAuditLogs({ offset, limit: PAGE_SIZE }),
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-4">
      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
        Showing {Math.min(offset + 1, total)}-{Math.min(offset + PAGE_SIZE, total)} of {total} entries
      </div>

      <div className="overflow-auto border border-light-border dark:border-dark-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-light-surface dark:bg-dark-surface">
            <tr>
              <th className="text-left p-3">Timestamp</th>
              <th className="text-left p-3">Actor</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Target</th>
              <th className="text-left p-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="p-3" colSpan={5}>
                  Loading audit logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td className="p-3" colSpan={5}>
                  No audit records found.
                </td>
              </tr>
            ) : (
              logs.map((entry: any) => (
                <tr
                  key={entry.id}
                  className="border-t border-light-border dark:border-dark-border align-top"
                >
                  <td className="p-3 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {entry.actor_username || entry.actor_id || 'system'}
                  </td>
                  <td className="p-3 whitespace-nowrap font-mono">{entry.action}</td>
                  <td className="p-3 whitespace-nowrap">
                    {entry.target_type || '-'}:{entry.target_id || '-'}
                  </td>
                  <td className="p-3 whitespace-nowrap">{entry.ip_address || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
          className="px-3 py-1 rounded border border-light-border dark:border-dark-border disabled:opacity-50"
        >
          Previous
        </button>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={offset + PAGE_SIZE >= total}
          className="px-3 py-1 rounded border border-light-border dark:border-dark-border disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};
