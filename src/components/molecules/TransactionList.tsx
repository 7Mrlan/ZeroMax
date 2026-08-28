import {RefreshControl, View} from 'react-native';
import {TouchableOpacity} from 'react-native-gesture-handler';
import React, {useCallback, useEffect, useMemo, useRef, memo} from 'react';
import {useTranslation} from 'react-i18next';
import useThemeColors, {Colors} from '../../hooks/useThemeColors';
import type {SwipeableMethods} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from '../atoms/Icons';
import {formatDate, formatCalendar} from '../../utils/dateUtils';
import {navigate} from '../../utils/navigationUtils';
import {deleteExpenseById, ExpenseData as ExpenseDocType} from '../../watermelondb/services';
import {useAppDispatch} from '../../redux/hooks';
import {fetchExpenses, fetchExpensesByMonth, invalidateExpenseCache, fetchEverydayExpenses} from '../../redux/slice/expenseDataSlice';
import PrimaryText from '../atoms/PrimaryText';
import SwipeableRow from '../atoms/SwipeableRow';
import useFormatAmount from '../../hooks/useFormatAmount';
import {FlashList, useRecyclingState} from '@shopify/flash-list';
import type {AppDispatch} from '../../redux/store';
import {gs} from '../../styles/globalStyles';

interface CategoryInfo {
  id?: string;
  name?: string;
  icon?: string;
  color?: string;
}

interface Expense extends ExpenseDocType {
  category?: CategoryInfo;
}

interface TransactionListProps {
  allExpenses: Array<Expense>;
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

interface TransactionItemProps {
  expense?: Array<Expense>;
  colors: Colors;
  dispatch: AppDispatch;
  label: string;
  targetDate?: string;
  targetMonth?: string;
  openSwipeableRef: React.RefObject<{close: () => void} | null>;
  edgeToEdge: boolean;
  tutorialSwipeRef?: React.RefObject<SwipeableMethods | null>;
  isFirstGroup?: boolean;
}

interface ExpenseRowProps {
  expense: Expense;
  colors: Colors;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => void;
  openSwipeableRef: React.RefObject<{close: () => void} | null>;
  edgeToEdge: boolean;
  tutorialSwipeRef?: React.RefObject<SwipeableMethods | null>;
}

interface GroupedExpense {
  date: string;
  expenses: Array<Expense>;
  label: string;
}

const ExpenseRow: React.FC<ExpenseRowProps> = React.memo(
  ({expense, colors, onEdit, onDelete, openSwipeableRef, edgeToEdge, tutorialSwipeRef}) => {
    const formatAmount = useFormatAmount();

    const handleEdit = useCallback(() => {
      onEdit(expense);
    }, [onEdit, expense]);

    const handleDelete = useCallback(() => {
      onDelete(String(expense.id));
    }, [onDelete, expense.id]);

    return (
      <View style={gs.mb5}>
        <SwipeableRow
          onEdit={handleEdit}
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
                  name={expense.category?.icon || 'circle-dot'}
                  size={18}
                  color={expense.category?.color || colors.buttonText}
                />
              </View>
              <View style={[gs.flex1, gs.gap2]}>
                <PrimaryText weight="medium" numberOfLines={1}>{expense.title}</PrimaryText>
                <PrimaryText size={11} color={colors.secondaryText} numberOfLines={1}>
                  {expense.category?.name}
                  {expense.description ? ` · ${expense.description}` : ''}
                  {' · '}
                  {formatDate(expense.date, 'Do MMM')}
                </PrimaryText>
              </View>
            </View>
            <View style={gs.ml10}>
              <PrimaryText size={14} weight="semibold" variant="number">
                {formatAmount(expense.amount)}
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
          style={[gs.py8, gs.px14, gs.rounded10, {backgroundColor: colors.accentGreen}]}>
          <PrimaryText size={12} weight="semibold" color={colors.buttonText}>
            {t('common.undo')}
          </PrimaryText>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const TransactionItem: React.FC<TransactionItemProps> = React.memo(
  ({expense: initialExpense, colors, dispatch, label, targetDate, targetMonth, openSwipeableRef, edgeToEdge, tutorialSwipeRef, isFirstGroup}) => {
    const deletionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDeleteRef = useRef<string | null>(null);
    // Indirection so the recycle callback below can flush without touching
    // consts that may still be in their temporal dead zone on first render.
    const flushRef = useRef<() => void>(() => {});
    const formatAmount = useFormatAmount();

    const [expenses, setExpenses] = useRecyclingState<Array<Expense>>(initialExpense || [], [initialExpense], () => {
      // A row awaiting its undo window can be recycled at any time. Commit the
      // delete instead of cancelling it — cancelling silently resurrects the
      // row and loses the user's action.
      flushRef.current();
    });
    const [deletedItemId, setDeletedItemId] = useRecyclingState<string | null>(null, [initialExpense]);
    const deletedItemRef = useRef<Expense | null>(null);

    const handleEdit = useCallback((expense: Expense) => {
      navigate('UpdateTransactionScreen', {
        expenseId: String(expense.id),
        expenseTitle: expense.title,
        expenseDescription: expense.description ?? '',
        category: expense.category ?? {name: '', icon: '', color: ''},
        expenseDate: expense.date,
        expenseAmount: expense.amount,
      });
    }, []);

    const commitDelete = useCallback(
      async (expenseId: string) => {
        pendingDeleteRef.current = null;
        try {
          await deleteExpenseById(expenseId);
          dispatch(invalidateExpenseCache());
          if (targetMonth) {
            dispatch(fetchExpensesByMonth(targetMonth));
          } else {
            dispatch(fetchExpenses());
          }
          if (targetDate) {
            dispatch(fetchEverydayExpenses(targetDate));
          }
        } catch (error) {
          if (__DEV__) {
            console.error('Error deleting expense:', error);
          }
        }
      },
      [dispatch, targetDate, targetMonth],
    );

    const flushPendingDelete = useCallback(() => {
      const pendingId = pendingDeleteRef.current;
      if (!pendingId) {
        return;
      }
      if (deletionTimeoutRef.current) {
        clearTimeout(deletionTimeoutRef.current);
        deletionTimeoutRef.current = null;
      }
      // Deferred: this can be invoked from a render-phase recycle callback,
      // and dispatching to redux during render is not safe.
      setTimeout(() => {
        void commitDelete(pendingId);
      }, 0);
    }, [commitDelete]);

    flushRef.current = flushPendingDelete;

    // Commit rather than drop a pending delete when the row goes away.
    useEffect(() => flushPendingDelete, [flushPendingDelete]);

    const handleDelete = useCallback(
      (expenseId: string) => {
        const deletedExpense = expenses.find(expense => String(expense.id) === expenseId) ?? null;
        deletedItemRef.current = deletedExpense;
        setDeletedItemId(expenseId);

        if (deletionTimeoutRef.current) {
          clearTimeout(deletionTimeoutRef.current);
        }
        pendingDeleteRef.current = expenseId;

        deletionTimeoutRef.current = setTimeout(() => {
          deletionTimeoutRef.current = null;
          setExpenses(prev => prev.filter(e => String(e.id) !== expenseId));
          setDeletedItemId(null);
          deletedItemRef.current = null;
          void commitDelete(expenseId);
        }, 3000);
      },
      [expenses, setExpenses, setDeletedItemId, commitDelete],
    );

    const handleUndo = useCallback(() => {
      if (deletionTimeoutRef.current) {
        clearTimeout(deletionTimeoutRef.current);
        deletionTimeoutRef.current = null;
      }
      pendingDeleteRef.current = null;
      setDeletedItemId(null);
      deletedItemRef.current = null;
    }, [setDeletedItemId]);

    // The row awaiting undo is still in `expenses`, but it must not count
    // toward the day's total while it is shown as deleted.
    const dayTotal = useMemo(
      () =>
        expenses
          .filter(e => String(e.id) !== deletedItemId)
          .reduce((sum, e) => sum + e.amount, 0),
      [expenses, deletedItemId],
    );

    return (
      <View>
        <View style={[gs.rowBetweenCenter, gs.mb8, gs.mt15, edgeToEdge && gs.px16]}>
          <PrimaryText size={12} weight="semibold" color={colors.secondaryText}>
            {label}
          </PrimaryText>
          <PrimaryText size={12} weight="semibold" color={colors.secondaryText} variant="number">
            {formatAmount(dayTotal)}
          </PrimaryText>
        </View>
        {expenses.map((item, index) =>
          String(item.id) === deletedItemId ? (
            <InlineUndo key={String(item.id)} colors={colors} onUndo={handleUndo} edgeToEdge={edgeToEdge} />
          ) : (
            <ExpenseRow
              key={String(item.id)}
              expense={item}
              colors={colors}
              onEdit={handleEdit}
              onDelete={handleDelete}
              openSwipeableRef={openSwipeableRef}
              edgeToEdge={edgeToEdge}
              tutorialSwipeRef={isFirstGroup && index === 0 ? tutorialSwipeRef : undefined}
            />
          ),
        )}
      </View>
    );
  },
);

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
  const dispatch = useAppDispatch();
  const openSwipeableRef = useRef<{close: () => void} | null>(null);

  const groupedData: GroupedExpense[] = useMemo(() => {
    const groupedExpenses = new Map<string, Array<Expense>>();

    allExpenses?.forEach(expense => {
      const date = formatDate(expense.date, 'YYYY-MM-DD');
      const currentGroup = groupedExpenses.get(date) ?? [];
      currentGroup.push(expense);
      groupedExpenses.set(date, currentGroup);
    });

    const sortedDates = Array.from(groupedExpenses.keys()).sort((a, b) => {
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return sortedDates.map(date => ({
      date,
      expenses: (groupedExpenses.get(date) ?? []).sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
      label: formatCalendar(date),
    }));
  }, [allExpenses]);

  const renderGroupItem = useCallback(
    ({item, index}: {item: GroupedExpense; index: number}) => (
      <TransactionItem
        expense={item.expenses}
        colors={colors}
        dispatch={dispatch}
        targetDate={targetDate}
        targetMonth={targetMonth}
        label={item.label}
        openSwipeableRef={openSwipeableRef}
        edgeToEdge={edgeToEdge}
        tutorialSwipeRef={index === 0 ? tutorialSwipeRef : undefined}
        isFirstGroup={index === 0}
      />
    ),
    [colors, dispatch, targetDate, targetMonth, edgeToEdge, tutorialSwipeRef],
  );

  const refreshControl = useMemo(
    () =>
      onRefresh ? (
        <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} />
      ) : undefined,
    [refreshing, onRefresh],
  );

  return (
    <FlashList
      data={groupedData}
      renderItem={renderGroupItem}
      keyExtractor={item => item.date}
      extraData={allExpenses}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
    />
  );
};

export default memo(TransactionList);
