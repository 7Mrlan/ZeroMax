import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text, View} from 'react-native';
import type {HomeStackParamList, TabParamList} from './types';
import {useTranslation} from 'react-i18next';
import Icon from '../components/atoms/Icons';
import ReportsScreen from '../screens/ReportsScreen';
import DebtsScreen from '../screens/DebtsScreen';
import CategoryScreen from '../screens/CategoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import DiagnosticsScreen from '../screens/DiagnosticsScreen';
import AddTransactionsScreen from '../screens/AddTransactionsScreen';
import AddEntryScreen from '../screens/AddEntryScreen';
import AiQueueScreen from '../screens/AiQueueScreen';
import AiSettingsScreen from '../screens/AiSettingsScreen';
import UpdateTransactionScreen from '../screens/UpdateTransactionScreen';
import AddCategoryScreen from '../screens/AddCategoryScreen';
import UpdateCategoryScreen from '../screens/UpdateCategoryScreen';
import AddDebtorScreen from '../screens/AddDebtorScreen';
import IndividualDebtsScreen from '../screens/IndividualDebtsScreen';
import AddDebtsScreen from '../screens/AddDebtsScreen';
import UpdateDebtScreen from '../screens/UpdateDebtScreen';
import EverydayTransactionScreen from '../screens/EverydayTransactionScreen';
import CategoryTransactionScreen from '../screens/CategoryTransactionScreen';
import UpdateDebtorScreen from '../screens/UpdateDebtorScreen';
import {gs} from '../styles/globalStyles';
import AnimatedTabBar from './AnimatedTabBar';

const screenOptions = {
  headerShown: false,
};

const ICON_SIZE = 24;

const HomeIcon = ({color}: {color: string}) => {
  const {t} = useTranslation();
  return (
    <View style={[gs.center, gs.minW70]}>
      <View style={[gs.h26, gs.center]}>
        <Icon name="home" size={ICON_SIZE} color={color} />
      </View>
      <Text style={[gs.text10, gs.fontMedium, gs.noFontPadding, gs.textCenter, gs.mt2, {color}]}>{t('tabs.home')}</Text>
    </View>
  );
};

const ReportsIcon = ({color}: {color: string}) => {
  const {t} = useTranslation();
  return (
    <View style={[gs.center, gs.minW70]}>
      <View style={[gs.h26, gs.center]}>
        <Icon name="bar-chart-3" size={ICON_SIZE} color={color} />
      </View>
      <Text style={[gs.text10, gs.fontMedium, gs.noFontPadding, gs.textCenter, gs.mt2, {color}]}>
        {t('tabs.reports')}
      </Text>
    </View>
  );
};

const DebtIcon = ({color}: {color: string}) => {
  const {t} = useTranslation();
  return (
    <View style={[gs.center, gs.minW70]}>
      <View style={[gs.h26, gs.center]}>
        <Icon name="credit-card" size={ICON_SIZE} color={color} />
      </View>
      <Text style={[gs.text10, gs.fontMedium, gs.noFontPadding, gs.textCenter, gs.mt2, {color}]}>
        {t('tabs.debts')}
      </Text>
    </View>
  );
};

const CategoriesIcon = ({color}: {color: string}) => {
  const {t} = useTranslation();
  return (
    <View style={[gs.center, gs.minW70]}>
      <View style={[gs.h26, gs.center]}>
        <Icon name="shapes" size={ICON_SIZE} color={color} />
      </View>
      <Text style={[gs.text10, gs.fontMedium, gs.noFontPadding, gs.textCenter, gs.mt2, {color}]}>
        {t('tabs.categories')}
      </Text>
    </View>
  );
};

const Stack = createNativeStackNavigator<HomeStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TabStack = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
      tabBar={props => <AnimatedTabBar {...props} />}>
      <Tab.Screen name="HomeScreen" component={HomeScreen} options={{headerShown: false, tabBarIcon: HomeIcon}} />
      <Tab.Screen
        name="ReportsScreen"
        component={ReportsScreen}
        options={{headerShown: false, tabBarIcon: ReportsIcon}}
      />
      <Tab.Screen
        name="CategoryScreen"
        component={CategoryScreen}
        options={{headerShown: false, tabBarIcon: CategoriesIcon}}
      />
      <Tab.Screen name="DebtsScreen" component={DebtsScreen} options={{headerShown: false, tabBarIcon: DebtIcon}} />
    </Tab.Navigator>
  );
};

const HomeStack = () => {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="TabStack" component={TabStack} />
      <Stack.Screen name="SettingsScreen" component={SettingsScreen} />
      <Stack.Screen name="AddTransactionsScreen" component={AddTransactionsScreen} />
      <Stack.Screen name="AddEntryScreen" component={AddEntryScreen} />
      <Stack.Screen name="AiQueueScreen" component={AiQueueScreen} />
      <Stack.Screen name="AiSettingsScreen" component={AiSettingsScreen} />
      <Stack.Screen name="UpdateTransactionScreen" component={UpdateTransactionScreen} />
      <Stack.Screen name="AddCategoryScreen" component={AddCategoryScreen} />
      <Stack.Screen name="UpdateCategoryScreen" component={UpdateCategoryScreen} />
      <Stack.Screen name="EverydayTransactionScreen" component={EverydayTransactionScreen} />
      <Stack.Screen name="CategoryTransactionScreen" component={CategoryTransactionScreen} />
      <Stack.Screen name="AddDebtorScreen" component={AddDebtorScreen} />
      <Stack.Screen name="IndividualDebtsScreen" component={IndividualDebtsScreen} />
      <Stack.Screen name="AddDebtsScreen" component={AddDebtsScreen} />
      <Stack.Screen name="UpdateDebtScreen" component={UpdateDebtScreen} />
      <Stack.Screen name="UpdateDebtorScreen" component={UpdateDebtorScreen} />
      <Stack.Screen name="DiagnosticsScreen" component={DiagnosticsScreen} />
    </Stack.Navigator>
  );
};

export default HomeStack;
