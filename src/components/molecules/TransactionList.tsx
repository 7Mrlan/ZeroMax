import {RefreshControl, View} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import React, {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {useTranslation} from 'react-i18next';
import useThemeColors, {Colors} from '../../hooks/useThemeColors';
import type {SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from '../atoms/Icons';
import {formatCalendar, formatDate} from '../../utils/dateUtils';
import {navigate} from '../../utils/navigationUtils';
import {deleteExpenseById, deleteIncomeById} from '../../watermelondb/services';
import {useAppDispatch} from '../../redux/hooks';
import {
  fetchExpenses,
  fetchExpensesByMonth,
  invalidateExpenseCache,
  fetchEverydayExpenses,
} from '../../redux/slice/expenseDataSlice';
import {fetchIncomesByMonth, invalidateIncomeCache} from '../../redux/slice/incomeDataSlice';
import PrimaryText from '../atoms/PrimaryText';
import SwipeableRow from '../atoms/SwipeableRow';
import useFormatAmount from '../../hooks/useFormatAmount';
import {FlashList} from '@shopify/flash-list';
import {gs} from '../../styles/globalStyles';
import {
  flattenTransactionList,
  getTransactionKind,
  transactionListKey,
  type TransactionListItem,
  type TransactionListTransaction,
} from './transactionListData';

type Transaction = TransactionListTransaction;

interface TransactionListProps {
  /** Kept for call-site compatibility; the list accepts income rows as well. */
  allExpenses: Array<Transaction>;
  targetDate?: string;
  targetMonth?: string;
  edgeToEdge?: boolean;
  ListHeaderComponent?: React.ReactElement;
  ListEmptyComponent?: React.ReactElement;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: {paddingBottom?: number};
  tutorialSwipeRef?: React.RefObject<SwipeableMethods | null>;
}

interface ExpenseRowProps {
  transaction: Transaction;
  colors: Colors;
  onEdit?: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  openSwipeableRef: React.RefObject<{close: () => void} | null>;
  edgeToEdge: boolean;
  tutorialSwipeRef?: React.RefObject<SwipeableMethods | null>;
}

const ExpenseRow: React.FC<ExpenseRowProps> = React.memo(
  ({transaction, colors, onEdit, onDelete, openSwipeableRef, edgeToEdge, tutorialSwipeRef}) => {
    const formatAmount = useFormatAmount();
    const kind = getTransactionKind(transaction);
    const isIncome = kind === 'income';

    const handleEdit = useCallback(() => {
      onEdit?.(transaction);
    }, [onEdit, transaction]);

    const handleDelete = useCallback(() => {
      onDelete(transaction);
    }, [onDelete, transaction]);

    const categoryLabel = transaction.category?.parentName
      ? `${transaction.category.parentName} · ${transaction.category.name ?? ''}`
      : transaction.category?.name;

    return (
      <View style={gs.mb5}>
        <SwipeableRow
          onEdit={onEdit ? handleEdit : undefined}
          onDelete={handleDelete}
          colors={colors}
          swipeRef={tutorialSwipeRef}
          openSwipeableRef={openSwipeableRef}
          edgeToEdge={edgeToEdge}>
          <View
            style={[
              gs.rounded12,
              gs.rowBetweenCenter,
              gs.px14,
              gs.py10,
              edgeToEdge && gs.mx16,
              {backgroundColor: colors.containerColor},
            ]}>
            <View style={[gs.rowCenter, gs.flex1]}>
              <View style={[gs.size36, gs.center, gs.rounded10, gs.mr10, {backgroundColor: colors.iconContainer}]}>
                <Icon
                  name={transaction.category?.icon || 'circle-dot'}
                  size={18}
                  color={isIncome ? colors.accentGreen : transaction.category?.color || colors.buttonText}
                />
              </View>
              <View style={[gs.flex1, gs.gap2]}>
                <PrimaryText weight="medium" numberOfLines={1}>
                  {transaction.title}
                </PrimaryText>
                <PrimaryText size={11} color={colors.secondaryText} numberOfLines={1}>
                  {categoryLabel}
                  {transaction.description ? ` · ${transaction.description}` : ''}
                  {' · '}
                  {formatDate(transaction.date, 'Do MMM')}
                </PrimaryText>
              </View>
            </View>
            <View style={gs.ml10}>
              <PrimaryText
                size={14}
                weight="semibold"
                variant="number"
                color={isIncome ? colors.accentGreen : colors.primaryText}>
                {isIncome ? '+' : ''}
                {formatAmount(transaction.amount)}
              </PrimaryText>
            </View>
          </View>
        </SwipeableRow>
      </View>
    );
  },
);

const InlineUndo: React.FC<{
  colors: Colors;
  onUndo: () => void;
  edgeToEdge: boolean;
}> = memo(({colors, onUndo, edgeToEdge}) => {
  const {t} = useTranslation();
  return (
    <View style={gs.mb5}>
      <View
        style={[
          gs.rounded12,
          gs.rowBetweenCenter,
          gs.px14,
          gs.py12,
          edgeToEdge && gs.mx16,
          {backgroundColor: colors.secondaryAccent},
        ]}>
        <PrimaryText size={13} color={colors.secondaryText}>
          {t('transaction.deleted')}
        </PrimaryText>
        <TouchableOpacity
          onPress={onUndo}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.undo')}
          style={[gs.py8, gs.px14, gs.rounded10, {backgroundColor: colors.accentGreen}]}>
          <PrimaryText size={12} weight="semibold" color={colors.buttonText}>
            {t('common.undo')}
          </PrimaryText>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const TransactionList: React.FC<TransactionListProps> = ({
  allExpenses,
  targetDate,
  targetMonth,
  edgeToEdge = false,
  ListHeaderComponent,
  ListEmptyComponent,
  refreshing,
  onRefresh,
  contentContainerStyle,
  tutorialSwipeRef,
}) => {
  const colors = useThemeColors();
  const formatAmount = useFormatAmount();
  const dispatch = useAppDispatch();
  const openSwipeableRef = useRef<{close: () => void} | null>(null);
  const deletionTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const committingDeletesRef = useRef<Set<string>>(new Set());
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, Transaction>>(() => new Map());
  const mountedRef = useRef(true);
  const pendingDeletesRef = useRef(pendingDeletes);
  pendingDeletesRef.current = pendingDeletes;

  const removePendingDelete = useCallback((key: string) => {
    if (!mountedRef.current) return;
    setPendingDeletes(previous => {
      if (!previous.has(key)) return previous;
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
  }, []);

  const refreshAfterDelete = useCallback(
    async (transaction: Transaction) => {
      if (getTransactionKind(transaction) === 'income') {
        dispatch(invalidateIncomeCache());
        if (targetMonth) {
          await dispatch(fetchIncomesByMonth(targetMonth));
        }
        return;
      }

      dispatch(invalidateExpenseCache());
      if (targetMonth) {
        await dispatch(fetchExpensesByMonth(targetMonth));
      } else {
        await dispatch(fetchExpenses());
      }
      if (targetDate) {
        await dispatch(fetchEverydayExpenses(targetDate));
      }
    },
    [dispatch, targetDate, targetMonth],
  );

  const commitDelete = useCallback(
    async (key: string, transaction: Transaction, removeLocal = true) => {
      // Unmount cleanup can race with a timer callback that already started
      // the database write. Never issue a second permanent delete for a row.
      if (committingDeletesRef.current.has(key)) return;
      committingDeletesRef.current.add(key);
      try {
        if (getTransactionKind(transaction) === 'income') {
          await deleteIncomeById(String(transaction.id));
        } else {
          await deleteExpenseById(String(transaction.id));
        }
        await refreshAfterDelete(transaction);
      } catch (error) {
        if (__DEV__) {
          console.error('Error deleting transaction:', error);
        }
      } finally {
        committingDeletesRef.current.delete(key);
        if (removeLocal) {
          removePendingDelete(key);
        }
      }
    },
    [refreshAfterDelete, removePendingDelete],
  );

  const commitDeleteRef = useRef(commitDelete);
  commitDeleteRef.current = commitDelete;

  // Leaving the screen or backgrounding the app must not cancel a user's
  // delete. Flush every pending timer through the same idempotent writer path
  // before the list instance disappears; otherwise a recycled row could
  // resurrect after the three-second undo window.
  useEffect(
    () => () => {
      mountedRef.current = false;
      deletionTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      deletionTimeoutsRef.current.clear();
      for (const [key, transaction] of pendingDeletesRef.current) {
        void commitDeleteRef.current(key, transaction, false);
      }
    },
    [],
  );

  const handleDelete = useCallback(
    (transaction: Transaction) => {
      const key = transactionListKey(transaction);
      setPendingDeletes(previous => {
        if (previous.has(key)) return previous;
        const next = new Map(previous);
        next.set(key, transaction);
        return next;
      });

      const existingTimeout = deletionTimeoutsRef.current.get(key);
      if (existingTimeout) clearTimeout(existingTimeout);
      const timeout = setTimeout(() => {
        deletionTimeoutsRef.current.delete(key);
        void commitDelete(key, transaction);
      }, 3000);
      deletionTimeoutsRef.current.set(key, timeout);
    },
    [commitDelete],
  );

  const handleUndo = useCallback(
    (key: string) => {
      if (committingDeletesRef.current.has(key)) return;
      const timeout = deletionTimeoutsRef.current.get(key);
      if (timeout) {
        clearTimeout(timeout);
        deletionTimeoutsRef.current.delete(key);
      }
      removePendingDelete(key);
    },
    [removePendingDelete],
  );

  const handleEdit = useCallback((transaction: Transaction) => {
    if (getTransactionKind(transaction) === 'income') return;
    navigate('UpdateTransactionScreen', {
      expenseId: String(transaction.id),
      expenseTitle: transaction.title,
      expenseDescription: transaction.description ?? '',
      category: transaction.category ?? {name: '', icon: '', color: ''},
      expenseDate: transaction.date,
      expenseAmount: transaction.amount,
    });
  }, []);

  const listData = useMemo<TransactionListItem<Transaction>[]>(
    () => flattenTransactionList(allExpenses, pendingDeletes),
    [allExpenses, pendingDeletes],
  );

  const renderItem = useCallback(
    ({item, index}: {item: TransactionListItem<Transaction>; index: number}) => {
      if (item.itemType === 'header') {
        return (
          <View style={[gs.rowBetweenCenter, gs.mb8, gs.mt15, edgeToEdge && gs.px16]}>
            <PrimaryText size={12} weight="semibold" color={colors.secondaryText}>
              {formatCalendar(item.date)}
            </PrimaryText>
            <PrimaryText size={12} weight="semibold" color={colors.secondaryText} variant="number">
              {formatAmount(item.total)}
            </PrimaryText>
          </View>
        );
      }

      if (item.itemType === 'pendingDelete') {
        return <InlineUndo colors={colors} onUndo={() => handleUndo(item.id)} edgeToEdge={edgeToEdge} />;
      }

      const transactionKind = getTransactionKind(item.transaction);
      return (
        <ExpenseRow
          transaction={item.transaction}
          colors={colors}
          onEdit={transactionKind === 'expense' ? handleEdit : undefined}
          onDelete={handleDelete}
          openSwipeableRef={openSwipeableRef}
          edgeToEdge={edgeToEdge}
          tutorialSwipeRef={index === 1 ? tutorialSwipeRef : undefined}
        />
      );
    },
    [colors, edgeToEdge, formatAmount, handleDelete, handleEdit, handleUndo, tutorialSwipeRef],
  );

  const refreshControl = useMemo(
    () => (onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} /> : undefined),
    [refreshing, onRefresh],
  );

  return (
    <FlashList<TransactionListItem<Transaction>>
      data={listData}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      extraData={pendingDeletes}
      getItemType={item => item.itemType}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
    />
  );
};

export default memo(TransactionList);
