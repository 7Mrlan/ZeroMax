import React from 'react';
import CategoryEntry from '../../components/molecules/CategoryEntry';
import {useRoute, type RouteProp} from '@react-navigation/native';
import type {HomeStackParamList} from '../../navigation/types';

const AddCategoryScreen = () => {
  const route = useRoute<RouteProp<HomeStackParamList, 'AddCategoryScreen'>>();
  const kind = route.params?.kind ?? 'expense';
  return <CategoryEntry type="Add" kind={kind} />;
};

export default AddCategoryScreen;
