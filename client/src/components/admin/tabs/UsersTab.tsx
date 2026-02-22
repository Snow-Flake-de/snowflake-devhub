import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../utils/api/admin';
import { useToast } from '../../../hooks/useToast';
import { ConfirmationModal } from '../../common/modals/ConfirmationModal';
import { useDebounce } from '../../../hooks/useDebounce';
import {
  FilterInput,
  FilterSelect,
  AdminTable,
  Pagination,
  ResultsCount,
  StatusBadge,
  formatDate,
  type TableColumn,
} from '../common';

export const UsersTab: React.FC = () => {
  const { t } = useTranslation();
  const { t: translate } = useTranslation('components/admin/tabs/users');
  const [search, setSearch] = useState('');
  const [authType, setAuthType] = useState('');
  const [isActive, setIsActive] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const limit = 50;

  const debouncedSearch = useDebounce(search, 300);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', offset, debouncedSearch, authType, isActive, status, role],
    queryFn: () =>
      adminApi.getUsers({
        offset,
        limit,
        search: debouncedSearch,
        authType,
        isActive,
        status,
        role,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      addToast(translate('success.delete.default'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setDeleteUserId(null);
    },
    onError: (error: any) => {
      addToast(error.message || translate('error.delete.default'), 'error');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: number) => adminApi.toggleUserActive(id),
    onSuccess: () => {
      addToast(translate('success.update.default'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: any) => {
      addToast(error.message || translate('error.update.default'), 'error');
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' }) =>
      adminApi.setUserStatus(id, status),
    onSuccess: () => {
      addToast('User status updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (error: any) => {
      addToast(error.message || 'Failed to update user status', 'error');
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (id: number) => adminApi.unlockUser(id),
    onSuccess: () => {
      addToast('User unlocked', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: any) => {
      addToast(error.message || 'Failed to unlock user', 'error');
    },
  });

  const resetSessionsMutation = useMutation({
    mutationFn: (id: number) => adminApi.resetUserSessions(id),
    onSuccess: () => {
      addToast('Sessions reset', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: any) => {
      addToast(error.message || 'Failed to reset sessions', 'error');
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER' | 'READ_ONLY' }) =>
      adminApi.setUserRole(id, role),
    onSuccess: () => {
      addToast('User role updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (error: any) => {
      addToast(error.message || 'Failed to update user role', 'error');
    },
  });

  const users = data?.users || [];
  const total = data?.total || 0;

  const columns: TableColumn<any>[] = [
    {
      key: 'id',
      label: 'ID',
      render: (user) => (
        <span className="whitespace-nowrap text-light-text dark:text-dark-text">
          {user.id}
        </span>
      ),
    },
    {
      key: 'username',
      label: translate('columns.labels.username'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text dark:text-dark-text">
          {user.username}
          {
            user.is_admin
              ? (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-light-primary dark:bg-dark-primary text-white rounded">
                    Admin
                  </span>
                )
              : null
          }
          {user.role && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-light-bg-secondary dark:bg-dark-bg-secondary rounded">
              {user.role}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'email',
      label: translate('columns.labels.email'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text-secondary dark:text-dark-text-secondary">
          {user.email || '-'}
        </span>
      ),
    },
    {
      key: 'auth_type',
      label: translate('columns.labels.authType'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text-secondary dark:text-dark-text-secondary">
          {user.oidc_id ? translate('filters.authType.oidc') : translate('filters.authType.internal')}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: translate('columns.labels.created'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text-secondary dark:text-dark-text-secondary">
          {formatDate(user.created_at)}
        </span>
      ),
    },
    {
      key: 'last_login_at',
      label: translate('columns.labels.lastLogin'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text-secondary dark:text-dark-text-secondary">
          {formatDate(user.last_login_at)}
        </span>
      ),
    },
    {
      key: 'snippet_count',
      label: translate('columns.labels.snippetsCount'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text-secondary dark:text-dark-text-secondary">
          {user.snippet_count}
        </span>
      ),
    },
    {
      key: 'api_key_count',
      label: translate('columns.labels.apiKeysCount'),
      render: (user) => (
        <span className="whitespace-nowrap text-light-text-secondary dark:text-dark-text-secondary">
          {user.api_key_count}
        </span>
      ),
    },
    {
      key: 'status',
      label: translate('columns.labels.status'),
      render: (user) => (
        <span className="whitespace-nowrap">
          <StatusBadge
            label={user.status || (user.is_active ? translate('status.active') : translate('status.inactive'))}
            variant={(user.status === 'ACTIVE' || user.is_active) ? 'success' : (user.status === 'PENDING' ? 'warning' : 'danger')}
          />
        </span>
      ),
    },
    {
      key: 'actions',
      label: translate('columns.labels.actions'),
      render: (user) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <select
            value={user.role || 'USER'}
            onChange={(e) =>
              setRoleMutation.mutate({
                id: user.id,
                role: e.target.value as 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'USER' | 'READ_ONLY',
              })
            }
            className="px-1 py-1 text-xs rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg"
            title="Change role"
          >
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MODERATOR">MODERATOR</option>
            <option value="USER">USER</option>
            <option value="READ_ONLY">READ_ONLY</option>
          </select>
          <button
            onClick={() => setStatusMutation.mutate({ id: user.id, status: 'ACTIVE' })}
            className="px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border"
            title="Approve user"
          >
            Approve
          </button>
          <button
            onClick={() => setStatusMutation.mutate({ id: user.id, status: 'SUSPENDED' })}
            className="px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border"
            title="Suspend user"
          >
            Suspend
          </button>
          <button
            onClick={() => unlockMutation.mutate(user.id)}
            className="px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border"
            title="Unlock account"
          >
            Unlock
          </button>
          <button
            onClick={() => resetSessionsMutation.mutate(user.id)}
            className="px-2 py-1 text-xs rounded border border-light-border dark:border-dark-border"
            title="Reset sessions"
          >
            Reset sessions
          </button>
          <button
            onClick={() => toggleActiveMutation.mutate(user.id)}
            className="p-1 hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary rounded"
            title={user.is_active ? translate('action.deactivate') : translate('action.activate')}
          >
            {user.is_active ? (
              <ToggleRight className="w-4 h-4 text-green-600" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setDeleteUserId(user.id)}
            className="p-1 hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary rounded text-red-600 dark:text-red-400"
            title={translate('action.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <FilterInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setOffset(0);
          }}
          placeholder={translate('filters.search')}
          className="flex-1"
          showSearchIcon
        />
        <FilterSelect
          value={authType}
          onChange={(value) => {
            setAuthType(value);
            setOffset(0);
          }}
          options={[
            { value: 'internal', label: translate('filters.authType.internal') },
            { value: 'oidc', label: translate('filters.authType.oidc') },
          ]}
          placeholder={translate('filters.authType.all')}
        />
        <FilterSelect
          value={isActive}
          onChange={(value) => {
            setIsActive(value);
            setOffset(0);
          }}
          options={[
            { value: 'true', label: translate('filters.status.active') },
            { value: 'false', label: translate('filters.status.inactive') },
          ]}
          placeholder={translate('filters.status.all')}
        />
        <FilterSelect
          value={status}
          onChange={(value) => {
            setStatus(value);
            setOffset(0);
          }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
          placeholder="All lifecycle states"
        />
        <FilterSelect
          value={role}
          onChange={(value) => {
            setRole(value);
            setOffset(0);
          }}
          options={[
            { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
            { value: 'ADMIN', label: 'ADMIN' },
            { value: 'MODERATOR', label: 'MODERATOR' },
            { value: 'USER', label: 'USER' },
            { value: 'READ_ONLY', label: 'READ_ONLY' },
          ]}
          placeholder="All roles"
        />
      </div>

      <ResultsCount offset={offset} limit={limit} total={total} entityName={translate('entityName', { count: total })} />

      <AdminTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        emptyMessage={translate('table.emptyMessage')}
        loadingMessage={translate('table.loadingMessage')}
        getRowKey={(user) => user.id}
      />

      <Pagination
        offset={offset}
        limit={limit}
        total={total}
        onPrevious={() => setOffset(Math.max(0, offset - limit))}
        onNext={() => setOffset(offset + limit)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteUserId !== null}
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => deleteUserId && deleteMutation.mutate(deleteUserId)}
        title={translate('confirmationModal.title')}
        message={translate('confirmationModal.message')}
        confirmLabel={t('action.delete')}
        cancelLabel={t('action.cancel')}
        variant="danger"
      />
    </div>
  );
};
