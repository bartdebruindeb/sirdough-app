export type Role = "OWNER" | "ORDER_TABLET" | "BAKKER" | "CUSTOMER";

const PERMISSIONS = {
  "recipes:read":     ["OWNER","ORDER_TABLET","BAKKER"],
  "recipes:write":    ["OWNER"],
  "production:read":  ["OWNER","ORDER_TABLET","BAKKER"],
  "production:write": ["OWNER","ORDER_TABLET"],
  "orders:read":            ["OWNER","ORDER_TABLET","BAKKER"],
  "orders:write":           ["OWNER","ORDER_TABLET"],
  "orders:write_recurring": ["OWNER","ORDER_TABLET"],
  "customers:read":   ["OWNER","ORDER_TABLET","BAKKER"],
  "customers:write":  ["OWNER"],
  "delivery:read":    ["OWNER","ORDER_TABLET","BAKKER"],
  "delivery:write":   ["OWNER","ORDER_TABLET","BAKKER"],
  "delivery:note":    ["OWNER", "BAKKER"],
  "invoicing:read":   ["OWNER"],
  "announcement:write": ["OWNER"],
} as const;

export type Permission = keyof typeof PERMISSIONS;
export function hasPermission(role: Role, permission: Permission) {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
