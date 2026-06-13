// Shared navigation config — used by both the Sidebar and the Dashboard,
// so every page that's available to a role automatically appears in both.
export const ALL_NAV = [
  { href: "/",             label: "Dashboard",     icon: "⬡", desc: "Overzicht en mededelingen",                     color: "#fef3c7" },
  { href: "/productie",    label: "Productie",     icon: "◈", desc: "Dagelijks productieoverzicht + deeg calculator", color: "#fde68a" },
  { href: "/recepten",     label: "Recepten",      icon: "◇", desc: "Bakkers percentages per broodsoort",            color: "#d1fae5" },
  { href: "/winkel",       label: "Winkel",        icon: "◉", desc: "Winkelvoorraad en productietemplates",          color: "#fef9c3" },
  { href: "/bestellingen", label: "Bestellingen",  icon: "◧", desc: "Vaste en eenmalige bestellingen invoeren",      color: "#dbeafe" },
  { href: "/logboek",      label: "Logboek",       icon: "📋", desc: "Geschiedenis van leveringen",                   color: "#e0e7ff" },
  { href: "/bezorgen",     label: "Bezorgen",      icon: "◬", desc: "Bezorglijst per klant afvinken",                color: "#ede9fe" },
  { href: "/klanten",      label: "Klanten",       icon: "◑", desc: "Klantgegevens en uitnodigingen",                color: "#fae8ff" },
  { href: "/team",         label: "Team",          icon: "◒", desc: "Teamleden en rollen beheren",                   color: "#cffafe" },
  { href: "/facturatie",   label: "Facturatie",    icon: "◰", desc: "Overzicht per klant over een periode",          color: "#fce7f3" },
];
