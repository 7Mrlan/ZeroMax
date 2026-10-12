import React from 'react';
import {useRoute} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import IncomeEntry from '../../components/molecules/IncomeEntry';
import type {HomeStackParamList} from '../../navigation/types';

const UpdateIncomeScreen = () => {
  const route = useRoute<RouteProp<HomeStackParamList, 'UpdateIncomeScreen'>>();
  return <IncomeEntry type="Update" route={route} />;
};

export default UpdateIncomeScreen;
