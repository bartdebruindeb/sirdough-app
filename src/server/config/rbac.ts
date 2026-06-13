export type Role = "OWNER" | "ORDER_TABLET" | "BAKKER" | "BEZORGER" | "CUSTOMER";

const PERMISSIONS = {
  "recipes:read":     ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"],
  "recipes:write":    ["OWNER"],
  "production:read":  ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"],
  "production:write": ["OWNER","ORDER_TABLET"],
  "orders:read":            ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"],
  "orders:write":           ["OWNER","ORDER_TABLET"],
  "orders:write_recurring": ["OWNER","ORDER_TABLET"],
  "customers:read":   ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"],
  "customers:write":  ["OWNER"],
  "delivery:read":    ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"],
  "delivery:write":   ["OWNER","ORDER_TABLET","BAKKER","BEZORGER"],
  "delivery:note":    ["OWNER","BEZORGER"],
  "invoicing:read":   ["OWNER"],
  "announcement:write": ["OWNER"],
} as const;

export type Permission = keyof typeof PERMISSIONS;
export function hasPermission(role: Role, permission: Permission) {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
