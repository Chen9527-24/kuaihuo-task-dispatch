import {
  Avatar,
  Connection,
  Collection,
  DocumentChecked,
  Files,
  Grid,
  House,
  List,
  Lock,
  MagicStick,
  Money,
  Monitor,
  OfficeBuilding,
  Setting,
  Tickets,
  User,
  UserFilled,
  VideoCamera
} from '@element-plus/icons-vue';

export const menuIconMap = {
  Avatar,
  Connection,
  Collection,
  DocumentChecked,
  Files,
  Grid,
  House,
  List,
  Lock,
  MagicStick,
  Money,
  Monitor,
  OfficeBuilding,
  Setting,
  Tickets,
  User,
  UserFilled,
  VideoCamera
};

export function getMenuIcon(name: string) {
  return menuIconMap[name as keyof typeof menuIconMap] ?? Grid;
}
