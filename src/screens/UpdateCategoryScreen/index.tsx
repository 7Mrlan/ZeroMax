import React from 'react';
import {RouteProp, useRoute} from '@react-navigation/native';
import CategoryEntry from '../../components/molecules/CategoryEntry';

export type UpdateCategoryScreenRouteProp = RouteProp<
  {
    UpdateCategoryScreen: {
      categoryId: string;
      categoryName: string;
      categoryIcon: string;
      categoryColor: string;
      categoryKind?: 'expense' | 'income';
      categoryParentId?: string | null;
    };
  },
  'UpdateCategoryScreen'
>;

const UpdateCategoryScreen = () => {
  const route = useRoute<UpdateCategoryScreenRouteProp>();

  return <CategoryEntry type="Update" route={route} kind={route.params.categoryKind ?? 'expense'} />;
};

export default UpdateCategoryScreen;
