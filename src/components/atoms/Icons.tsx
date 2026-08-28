import React, {memo} from 'react';
import {ICON_REGISTRY, isValidIconName, type IconName} from './IconRegistry';

interface IconProps {
  /**
   * `IconName` gives autocomplete and typo-checking for names written in
   * code, while the `string` arm keeps accepting icon names loaded from the
   * database (users pick those at runtime, so they cannot be a literal type).
   * Unknown names are caught by isValidIconName below.
   */
  name: IconName | (string & {});
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const Icon: React.FC<IconProps> = ({name, size = 24, color = '#000000', strokeWidth = 2}) => {
  if (!isValidIconName(name)) {
    if (__DEV__) {
      console.warn(`Icon "${name}" not found in registry`);
    }
    return null;
  }

  const IconComponent = ICON_REGISTRY[name];

  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
};

export default memo(Icon);
export {type IconName} from './IconRegistry';
