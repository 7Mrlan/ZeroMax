import type {NavigatorScreenParams} from '@react-navigation/native';

export type TabParamList = {
  HomeScreen: undefined;
  ReportsScreen: undefined;
  CategoryScreen: undefined;
  DebtsScreen: undefined;
};

export type HomeStackParamList = {
  TabStack: NavigatorScreenParams<TabParamList>;
  SettingsScreen: undefined;
  DiagnosticsScreen: undefined;
  AddTransactionsScreen: undefined;
  UpdateTransactionScreen: {
    expenseId: string;
    expenseTitle: string;
    expenseDescription: string;
    category: {name?: string; icon?: string; color?: string};
    expenseDate: string;
    expenseAmount: number;
  };
  AddCategoryScreen: undefined;
  UpdateCategoryScreen: {
    categoryId: string;
    categoryName: string;
    categoryIcon: string;
    categoryColor: string;
  };
  EverydayTransactionScreen: {
    dayTransactions?: Array<any>;
    isDate: string;
  };
  CategoryTransactionScreen: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    categoryIcon?: string;
    yearMonth: string;
    monthLabel: string;
  };
  AddDebtorScreen: undefined;
  IndividualDebtsScreen: {
    debtorName: string;
    debtorId: string;
    debtorType: string;
  };
  AddDebtsScreen: {
    debtorId: string;
    debtorName: string;
  };
  UpdateDebtScreen: {
    debtId: string;
    debtDescription: string;
    amount: number;
    debtorName: string;
    debtDate: string;
    debtorId: string;
    debtType: string;
  };
  UpdateDebtorScreen: {
    debtorId: string;
    debtorName: string;
    debtorType: string;
  };
};

export type OnboardingStackParamList = {
  SplashScreen: undefined;
  WelcomeScreen: undefined;
  ExistingUserScreen: undefined;
  PersonalizeScreen: undefined;
  OnboardingScreen: undefined;
  ChooseCurrencyScreen: undefined;
};
