export interface MenuItem {
  title: string;
  path: string;
  icon: string;
  closable?: boolean;
  hidden?: boolean;
  /** 对应目录/菜单权限编码，仅用于前端导航可见性。 */
  permissionCode?: string;
  /** 该菜单对应的按钮权限前缀；兼容旧角色只勾选按钮、未显式勾选菜单节点的情况。 */
  permissionPrefixes?: string[];
  /** 每日任务是登录后的默认可达页面，不受菜单节点权限影响。 */
  alwaysVisible?: boolean;
  children?: MenuItem[];
}

export interface TabItem {
  title: string;
  path: string;
  name: string;
  closable: boolean;
}
