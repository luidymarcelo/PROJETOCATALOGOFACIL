"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  Hammer,
  LocateFixed,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  Package,
  Pill,
  Pizza,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type StoreId = string;
type ViewMode = "catalog" | "admin";
type FulfillmentMode = "delivery" | "pickup";
type DeliveryFeeType = "fixed" | "per_km";
type OrderChannel = "whatsapp" | "internal";
type OrderMode = OrderChannel | "both";
export type InternalOrderContext = {
  source: "staff" | "table_device";
  storeId: string;
  storeSlug: string;
  tableId?: string | null;
  tableToken?: string | null;
  tableLabel?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  customerNameMode?: "hidden" | "optional" | "required";
};

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string | null;
  images?: string[];
  badge?: string;
  unit?: string;
  optionGroups?: ProductOptionGroup[];
};

type ProductOptionItem = { id: string; name: string; priceDelta: number };
type ProductOptionGroup = { id: string; name: string; minSelections: number; maxSelections: number; items: ProductOptionItem[] };
type SelectedProductOption = { groupId: string; groupName: string; itemId: string; itemName: string; priceDelta: number };
type ProductCategorySection = { category: string; products: Product[] };

type CatalogLayout = "horizontal" | "showcase";
type PublicCompanyIdentity = {
  tenant_id: string;
  company_name: string;
  theme_color: string | null;
  profile_image_url: string | null;
};

type Merchant = {
  id: StoreId;
  databaseId?: string;
  orderMode?: OrderMode;
  companyName: string;
  companyProfileImage: string | null;
  themeColor: string;
  name: string;
  segment: string;
  tagline: string;
  rating: number | null;
  distance: string | null;
  deliveryTime: string;
  minimumOrder: number;
  deliveryFee: number;
  deliveryFeeType: DeliveryFeeType;
  calculatesDeliveryFee: boolean;
  catalogLayout: CatalogLayout;
  whatsapp: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  cover: string | null;
  coverNote: string;
  icon: "pizza" | "pill" | "hammer" | "store";
  palette: string;
  categories: string[];
  products: Product[];
  integration: {
    mode: "Planilha + agendamento" | "API externa" | "Banco legado";
    status: "Pronto" | "Pendente" | "Conectado";
    cadence: string;
    source: string;
    lastSync: string;
  };
};

type CartItem = {
  merchantId: StoreId;
  product: Product;
  quantity: number;
  selectedOptions: SelectedProductOption[];
};

type Checkout = {
  name: string;
  serviceLocation: string;
  address: string;
  reference: string;
  payment: string;
  changeFor: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

type Coordinates = { latitude: number; longitude: number };
type OrderTotals = {
  subtotal: number;
  delivery: number;
  total: number;
  deliveryDistanceKm: number | null;
  deliveryFeePending: boolean;
};

const STORE_RADIUS_KM = 30;

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatWhatsapp(value: string) {
  const rawDigits = value.replace(/\D/g, "");
  const digits = (rawDigits.length > 11 && rawDigits.startsWith("55")
    ? rawDigits.slice(2)
    : rawDigits
  ).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function parameterBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function deliveryFeeTypeValue(value: unknown, fallback: DeliveryFeeType = "fixed"): DeliveryFeeType {
  return value === "fixed" || value === "per_km" ? value : fallback;
}

function catalogLayoutValue(value: unknown, fallback: CatalogLayout = "horizontal"): CatalogLayout {
  return value === "horizontal" || value === "showcase" ? value : fallback;
}

function orderModeValue(value: unknown, fallback: OrderMode = "whatsapp"): OrderMode {
  return value === "internal" || value === "whatsapp" || value === "both" ? value : fallback;
}

function orderChannelAvailable(mode: OrderMode | undefined, channel: OrderChannel) {
  const resolvedMode = mode ?? "whatsapp";
  return resolvedMode === "both" || resolvedMode === channel;
}

function requestCurrentPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

function catalogLocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Não foi possível acessar sua localização. Ative a localização do aparelho, confirme a permissão deste site no navegador e tente novamente.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Ative a localização do aparelho e tente novamente.";
  if (error.code === error.TIMEOUT) return "A localização demorou para responder. Verifique o GPS ou Wi-Fi e tente novamente.";
  return "Não foi possível obter sua localização.";
}

function storeCatalogUrl(storeId: StoreId, channel: OrderChannel = "whatsapp") {
  const path = channel === "internal" ? "/comanda" : "/";
  return `${path}?loja=${encodeURIComponent(storeId)}`;
}

function categorySectionId(storeId: StoreId, category: string) {
  const slug = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `catalog-category-${storeId}-${slug || "categoria"}`;
}

function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function merchantBranchLabel(merchant: Merchant) {
  const companyName = merchant.companyName.trim();
  const branchName = merchant.name.trim();
  return companyName.localeCompare(branchName, "pt-BR", { sensitivity: "base" }) === 0
    ? null
    : branchName;
}

function normalizeThemeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#176b52";
}

function mixHexColor(color: string, target: "#000000" | "#ffffff", amount: number) {
  const source = normalizeThemeColor(color).slice(1);
  const targetHex = target.slice(1);
  const channel = (offset: number) => Math.round(
    Number.parseInt(source.slice(offset, offset + 2), 16) * (1 - amount)
      + Number.parseInt(targetHex.slice(offset, offset + 2), 16) * amount,
  ).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

function themeContrast(color: string) {
  const hex = normalizeThemeColor(color).slice(1);
  const [red, green, blue] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 160 ? "#17211c" : "#ffffff";
}

function catalogThemeStyle(color: string): CSSProperties {
  const primary = normalizeThemeColor(color);
  return {
    "--primary": primary,
    "--primary-dark": mixHexColor(primary, "#000000", 0.24),
    "--primary-soft": mixHexColor(primary, "#ffffff", 0.88),
    "--primary-contrast": themeContrast(primary),
  } as CSSProperties;
}

const fallbackMerchants: Merchant[] = [
  {
    id: "bella-massa",
    companyName: "Bella Massa Pizzaria",
    companyProfileImage: null,
    themeColor: "#fb6f2d",
    name: "Bella Massa Pizzaria",
    segment: "Pizzaria",
    tagline: "Pizzas artesanais, borda recheada e combos da noite.",
    rating: 4.8,
    distance: "1,6 km",
    deliveryTime: "35-45 min",
    minimumOrder: 25,
    deliveryFee: 5.99,
    deliveryFeeType: "fixed",
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "5599999990001",
    address: "Av. Central, 320",
    latitude: -7.1908,
    longitude: -48.2073,
    cover:
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1400&q=80",
    coverNote: "",
    icon: "pizza",
    palette: "#fb6f2d",
    categories: ["Mais pedidos", "Pizzas", "Combos", "Bebidas"],
    integration: {
      mode: "Planilha + agendamento",
      status: "Pronto",
      cadence: "A cada 30 min",
      source: "catalogos/bella-massa.csv",
      lastSync: "Hoje, 19:42",
    },
    products: [
      {
        id: "pizza-calabresa",
        name: "Pizza Calabresa Grande",
        description: "Molho da casa, mussarela, calabresa fatiada e cebola.",
        category: "Pizzas",
        price: 46.9,
        badge: "Mais vendido",
        image:
          "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "pizza-frango",
        name: "Frango com Catupiry",
        description: "Frango temperado, catupiry, milho e orégano fresco.",
        category: "Pizzas",
        price: 52.9,
        image:
          "https://images.unsplash.com/photo-1594007654729-407eedc4be65?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "combo-familia",
        name: "Combo Família",
        description: "Duas pizzas grandes, refrigerante 2 L e molho extra.",
        category: "Combos",
        price: 109.9,
        badge: "Oferta",
        image:
          "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "refri-cola",
        name: "Refrigerante Cola 2 L",
        description: "Garrafa gelada para acompanhar o pedido.",
        category: "Bebidas",
        price: 12,
        image:
          "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    id: "farmacia-vida",
    companyName: "Farmacia Vida",
    companyProfileImage: null,
    themeColor: "#176b52",
    name: "Farmacia Vida",
    segment: "Farmacia",
    tagline: "Medicamentos, dermocosmeticos e itens de cuidado diario.",
    rating: 4.9,
    distance: "900 m",
    deliveryTime: "20-30 min",
    minimumOrder: 15,
    deliveryFee: 3.99,
    deliveryFeeType: "fixed",
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "5599999990002",
    address: "Rua das Flores, 88",
    latitude: -7.1842,
    longitude: -48.2101,
    cover:
      "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1400&q=80",
    coverNote: "",
    icon: "pill",
    palette: "#0fa76f",
    categories: ["Mais pedidos", "Medicamentos", "Higiene", "Dermocosmeticos"],
    integration: {
      mode: "API externa",
      status: "Conectado",
      cadence: "Tempo real + cache",
      source: "GET /produtos /estoque /precos",
      lastSync: "Hoje, 20:05",
    },
    products: [
      {
        id: "dipirona",
        name: "Dipirona 500 mg",
        description: "Caixa com 20 comprimidos. Consulte orientacao do farmaceutico.",
        category: "Medicamentos",
        price: 8.99,
        badge: "Popular",
        image:
          "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "protetor-solar",
        name: "Protetor Solar FPS 60",
        description: "Toque seco, 120 ml, indicado para uso diario.",
        category: "Dermocosmeticos",
        price: 59.9,
        image:
          "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "alcool-gel",
        name: "Alcool Gel 70%",
        description: "Frasco pump 500 ml para maos e superficies.",
        category: "Higiene",
        price: 11.5,
        image:
          "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "kit-cuidado",
        name: "Kit Cuidado Diario",
        description: "Sabonete liquido, hidratante e escova dental.",
        category: "Higiene",
        price: 42.9,
        badge: "Combo",
        image:
          "https://images.unsplash.com/photo-1556228724-4b3b98f15f24?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
  {
    id: "construmais",
    companyName: "Construmais Obras",
    companyProfileImage: null,
    themeColor: "#2563eb",
    name: "Construmais Obras",
    segment: "Material de construcao",
    tagline:
      "Cimento, areia, tijolo, hidraulica, eletrica e acabamento com entrega por rota.",
    rating: 4.6,
    distance: "2,4 km",
    deliveryTime: "2-4 h",
    minimumOrder: 80,
    deliveryFee: 18,
    deliveryFeeType: "fixed",
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "5599999990003",
    address: "Av. Filadelfia, 1280 - Setor Industrial",
    latitude: -7.2056,
    longitude: -48.2254,
    cover:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1400&q=80",
    coverNote: "",
    icon: "hammer",
    palette: "#d97706",
    categories: [
      "Mais pedidos",
      "Obra grossa",
      "Hidraulica",
      "Eletrica",
      "Tintas",
      "Ferramentas",
    ],
    integration: {
      mode: "Banco legado",
      status: "Pendente",
      cadence: "Agendado 06:00, 12:00 e 18:00",
      source: "SQL interno + tabela de estoque",
      lastSync: "Ontem, 18:00",
    },
    products: [
      {
        id: "cimento-cp2",
        name: "Cimento CP II 50 kg",
        description: "Saco fechado para alvenaria, reboco e pequenos reparos.",
        category: "Obra grossa",
        price: 37.9,
        badge: "Entrega hoje",
        unit: "saco 50 kg",
        image:
          "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "argamassa-ac2",
        name: "Argamassa ACII 20 kg",
        description: "Indicada para piso ceramico e parede interna ou externa.",
        category: "Obra grossa",
        price: 24.9,
        badge: "Piso e parede",
        unit: "saco 20 kg",
        image:
          "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "tijolo-8-furos",
        name: "Tijolo Ceramico 8 Furos",
        description: "Produto vendido por unidade, ideal para fechamento de paredes.",
        category: "Obra grossa",
        price: 0.89,
        badge: "Acima de 100 un",
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "areia-media",
        name: "Areia Media Lavada",
        description: "Carga para concreto, contrapiso e assentamento. Consulte rota.",
        category: "Obra grossa",
        price: 140,
        unit: "m3",
        image:
          "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "cano-pvc-25",
        name: "Cano PVC Soldavel 25 mm",
        description: "Barra de 6 metros para agua fria, padrao marrom.",
        category: "Hidraulica",
        price: 21.9,
        badge: "Mais pedido",
        unit: "barra 6 m",
        image:
          "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "registro-esfera",
        name: "Registro Esfera 25 mm",
        description: "Registro soldavel para manutencao rapida em linha de agua.",
        category: "Hidraulica",
        price: 18.5,
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1581092162384-8987c1d64926?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "tomada-20a",
        name: "Tomada 20 A Branca",
        description: "Modulo padrao brasileiro para instalacao residencial.",
        category: "Eletrica",
        price: 9.9,
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "fio-flexivel-25",
        name: "Fio Flexivel 2,5 mm 100 m",
        description: "Rolo antichama para tomadas e pequenos circuitos.",
        category: "Eletrica",
        price: 119.9,
        badge: "Cobre",
        unit: "rolo 100 m",
        image:
          "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "disjuntor-din-20a",
        name: "Disjuntor DIN 20 A",
        description: "Disjuntor monopolar para quadro residencial.",
        category: "Eletrica",
        price: 16.9,
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "tinta-acrilica",
        name: "Tinta Acrilica Fosca 18 L",
        description: "Alta cobertura para area interna, cor branco neve.",
        category: "Tintas",
        price: 219.9,
        badge: "Branco neve",
        unit: "lata 18 L",
        image:
          "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "rolo-la",
        name: "Rolo de La 23 cm",
        description: "Rolo para parede lisa, cabo ergonomico e boa retencao.",
        category: "Tintas",
        price: 17.9,
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "furadeira",
        name: "Furadeira Impacto 650 W",
        description: "Mandril 3/8, velocidade variavel e maleta.",
        category: "Ferramentas",
        price: 189.9,
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "trena-5m",
        name: "Trena Emborrachada 5 m",
        description: "Trava manual, fita metalica e caixa resistente.",
        category: "Ferramentas",
        price: 22.9,
        unit: "unidade",
        image:
          "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=800&q=80",
      },
    ],
  },
];

const iconByMerchant = {
  pizza: Pizza,
  pill: Pill,
  hammer: Hammer,
  store: Store,
};

const segmentLabels: Record<string, string> = {
  restaurant: "Restaurante",
  pharmacy: "Farmácia",
  construction: "Material de construção",
  retail: "Comércio",
};

function neutralMerchant(store: { id: string; slug: string; name: string; segment?: string | null; latitude?: number | null; longitude?: number | null }): Merchant {
  return {
    id: store.slug,
    companyName: store.name,
    companyProfileImage: null,
    themeColor: "#176b52",
    name: store.name,
    segment: segmentLabels[store.segment ?? ""] ?? "Comércio",
    tagline: `Catálogo de produtos de ${store.name}.`,
    rating: null,
    distance: null,
    deliveryTime: "Consulte a filial",
    minimumOrder: 0,
    deliveryFee: 0,
    deliveryFeeType: "fixed",
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "",
    address: "Endereço não informado",
    latitude: store.latitude == null ? null : Number(store.latitude),
    longitude: store.longitude == null ? null : Number(store.longitude),
    cover: null,
    coverNote: "",
    icon: "store",
    palette: "#176b52",
    categories: ["Mais pedidos"],
    products: [],
    integration: {
      mode: "Planilha + agendamento",
      status: "Pendente",
      cadence: "Manual",
      source: "Catálogo",
      lastSync: "Ainda não atualizado",
    },
  };
}

const initialCheckout: Checkout = {
  name: "",
  serviceLocation: "",
  address: "",
  reference: "",
  payment: "Pix",
  changeFor: "",
  notes: "",
  latitude: null,
  longitude: null,
};

const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function formatPrice(value: number) {
  return currency.format(value);
}

function formatOptionDelta(value: number) {
  if (!value) return "Grátis";
  return `${value > 0 ? "+ " : "- "}${formatPrice(Math.abs(value))}`;
}

function cleanOrderText(value: string, fallback = "Não informado") {
  const cleaned = value
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "");

  if (!/\d/.test(cleaned)) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function createOrderCode(now: Date) {
  const date = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = now.getTime().toString(36).slice(-5).toUpperCase();

  return `CF-${date}-${suffix}`;
}

function formatOrderMoment(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

function hasCoordinates(value: { latitude: number | null; longitude: number | null }): value is Coordinates {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

function mapsUrl({ latitude, longitude }: Coordinates) {
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function distanceInKm(origin: Coordinates, destination: Coordinates) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function distanceLabel(distanceKm: number) {
  return distanceKm < 1
    ? `${Math.max(1, Math.round(distanceKm * 1000))} m`
    : `${distanceKm.toFixed(1).replace(".", ",")} km`;
}

function buildWhatsappMessage({
  merchant,
  cart,
  checkout,
  fulfillment,
  totals,
  orderCode,
  createdAt,
}: {
  merchant: Merchant;
  cart: CartItem[];
  checkout: Checkout;
  fulfillment: FulfillmentMode;
  totals: OrderTotals;
  orderCode: string;
  createdAt: Date;
}) {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const productsTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const additionsTotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.selectedOptions.reduce((optionsTotal, option) => optionsTotal + option.priceDelta, 0),
    0,
  );
  const hasAdditions = cart.some((item) => item.selectedOptions.length > 0);
  const branchName = merchantBranchLabel(merchant);
  const items = cart
    .map(
      (item, index) => {
        const optionsTotalPerUnit = item.selectedOptions.reduce(
          (sum, option) => sum + option.priceDelta,
          0,
        );
        const optionsTotal = optionsTotalPerUnit * item.quantity;
        const unitPrice = item.product.price + optionsTotalPerUnit;
        const options = item.selectedOptions.length
          ? [
              "   Adicionais:",
              ...item.selectedOptions.map(
                (option) => `   - ${cleanOrderText(option.groupName)}: ${cleanOrderText(option.itemName)} (${formatOptionDelta(option.priceDelta)})`,
              ),
              `   Total em adicionais: ${formatPrice(optionsTotal)}`,
            ].join("\n")
          : "";
        const unit = item.product.unit
          ? `\n   Unidade: ${cleanOrderText(item.product.unit)}`
          : "";

        return `${String(index + 1).padStart(2, "0")}. *${cleanOrderText(item.product.name)}*
   Quantidade: ${item.quantity}
   Valor do produto: ${formatPrice(item.product.price)}${unit}${options ? `\n${options}` : ""}
   Total do item: *${formatPrice(unitPrice * item.quantity)}*`;
      },
    )
    .join("\n\n");

  const fulfillmentSection =
    fulfillment === "delivery"
      ? [
          "*ENTREGA*",
          "Modalidade: Entrega",
          `Endereço: ${cleanOrderText(checkout.address)}`,
          ...(hasCoordinates(checkout) ? [`Localização no mapa: ${mapsUrl(checkout)}`] : []),
          ...(totals.deliveryDistanceKm !== null ? [`Distância estimada: ${distanceLabel(totals.deliveryDistanceKm)}`] : []),
          `Complemento/referência: ${cleanOrderText(
            checkout.reference,
            "Não informado",
          )}`,
          `Previsão informada: ${cleanOrderText(merchant.deliveryTime)}`,
        ]
      : [
          "*RETIRADA*",
          "Modalidade: Retirada no local",
          `Local: ${cleanOrderText(merchant.address)}`,
          ...(hasCoordinates(merchant) ? [`Mapa da filial: ${mapsUrl(merchant)}`] : []),
          `Previsão informada: ${cleanOrderText(merchant.deliveryTime)}`,
        ];

  const changeAmount =
    checkout.payment === "Dinheiro" ? parseMoney(checkout.changeFor) : null;
  const deliveryIsPending = totals.deliveryFeePending;
  const paymentSection = [
    "*PAGAMENTO*",
    `Forma: ${cleanOrderText(checkout.payment)}`,
  ];

  if (changeAmount !== null) {
    paymentSection.push(`Troco para: ${formatPrice(changeAmount)}`);
    paymentSection.push(deliveryIsPending
      ? "Troco a devolver: Confirmar após calcular o frete"
      : `Troco a devolver: ${formatPrice(Math.max(0, changeAmount - totals.total))}`,
    );
  } else if (checkout.payment === "Dinheiro") {
    paymentSection.push("Troco: Não solicitado");
  }

  return [
    `*COMANDA #${orderCode}*`,
    `*${cleanOrderText(merchant.companyName)}*`,
    ...(branchName ? [`Filial: ${cleanOrderText(branchName)}`] : []),
    `Gerada em: ${formatOrderMoment(createdAt)}`,
    "----------------------------",
    "*CLIENTE*",
    `Nome: ${cleanOrderText(checkout.name)}`,
    "",
    ...fulfillmentSection,
    "",
    `*ITENS DO PEDIDO (${itemCount})*`,
    items,
    "",
    "----------------------------",
    "*RESUMO DE VALORES*",
    `Produtos: ${formatPrice(productsTotal)}`,
    ...(hasAdditions ? [`Total em adicionais: ${formatPrice(additionsTotal)}`] : []),
    `Subtotal: ${formatPrice(totals.subtotal)}`,
    ...(fulfillment === "delivery" && merchant.deliveryFeeType === "per_km" && totals.deliveryDistanceKm !== null
      ? [`Cálculo da entrega: ${distanceLabel(totals.deliveryDistanceKm)} × ${formatPrice(merchant.deliveryFee)}/km`]
      : []),
    `Taxa de entrega: ${deliveryIsPending ? "A combinar" : formatPrice(totals.delivery)}`,
    `*${deliveryIsPending ? "TOTAL PARCIAL" : "TOTAL"}: ${formatPrice(totals.total)}*`,
    "",
    ...paymentSection,
    "",
    "*OBSERVAÇÕES*",
    cleanOrderText(checkout.notes, "Sem observações."),
    "----------------------------",
    "Aguardando confirmação da loja.",
  ].join("\n");
}

export function CatalogApplication({ orderChannel, internalOrderContext }: { orderChannel: OrderChannel; internalOrderContext?: InternalOrderContext }) {
  const [merchants, setMerchants] = useState<Merchant[]>(
    hasSupabaseConfig ? [] : fallbackMerchants,
  );
  const [activeStoreId, setActiveStoreId] = useState<StoreId>("");
  const [activeCategory, setActiveCategory] = useState("Mais pedidos");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("catalog");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>(orderChannel === "internal" ? "pickup" : "delivery");
  const [checkout, setCheckout] = useState<Checkout>(initialCheckout);
  const [checkoutError, setCheckoutError] = useState("");
  const [submittingInternalOrder, setSubmittingInternalOrder] = useState(false);
  const [internalOrderCode, setInternalOrderCode] = useState("");
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [locatingUser, setLocatingUser] = useState(false);
  const [showAllStores, setShowAllStores] = useState(false);
  const [directStoreId, setDirectStoreId] = useState<StoreId | null>(null);
  const manualCategoryScrollRef = useRef<{ category: string; timeout: number } | null>(null);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const internalContextKey = internalOrderContext ? `${internalOrderContext.source}-${internalOrderContext.tableId ?? internalOrderContext.storeId}` : "default";
  const cartStorageKey = `catalogo-facil-cart-${orderChannel}-${internalContextKey}`;
  const checkoutStorageKey = `catalogo-facil-checkout-${orderChannel}-${internalContextKey}`;
  const [syncLog, setSyncLog] = useState<Record<StoreId, string>>({
    "bella-massa": fallbackMerchants[0].integration.lastSync,
    "farmacia-vida": fallbackMerchants[1].integration.lastSync,
    construmais: fallbackMerchants[2].integration.lastSync,
  });

  const merchant =
    merchants.find((store) => store.id === activeStoreId) ??
    merchants[0] ??
    fallbackMerchants[0];
  const displayMerchant = directStoreId
    ? merchants.find((store) => store.id === directStoreId) ?? null
    : merchant;

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      if (!supabase) return;
      const requestedStoreId = (internalOrderContext?.storeSlug ?? new URLSearchParams(window.location.search).get("loja")?.trim()) || null;
      setDirectStoreId(requestedStoreId);

      const [storeResult, tenantParameterResult, storeParameterResult, companyResult, optionGroupResult] = await Promise.all([
        supabase
          .from("stores")
          .select("*, categories(*), products(*, product_images(id, image_url, sort_order))")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("tenant_parameters")
          .select("tenant_id, parameter_key, parameter_value")
          .in("parameter_key", ["calculate_delivery_fee", "delivery_fee_type", "catalog_layout", "enable_additions", "order_mode"]),
        supabase
          .from("store_parameters")
          .select("store_id, parameter_key, parameter_value")
          .in("parameter_key", ["calculate_delivery_fee", "delivery_fee_type", "catalog_layout", "enable_additions", "order_mode"]),
        supabase.rpc("get_public_catalog_companies"),
        supabase
          .from("option_groups")
          .select("id, store_id, name, min_selections, max_selections, sort_order, option_group_items(id, name, price_delta, sort_order, is_active), product_option_groups(product_id, sort_order)")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      let { data, error } = storeResult;
      if (error && /product_images|relationship|schema cache/i.test(error.message)) {
        const fallbackStoreResult = await supabase
          .from("stores")
          .select("*, categories(*), products(*)")
          .eq("is_active", true)
          .order("created_at", { ascending: true });
        data = fallbackStoreResult.data;
        error = fallbackStoreResult.error;
      }

      if (error || cancelled) return;
      if (!data?.length) {
        setMerchants([]);
        return;
      }

      const tenantFreightParameters = new Map(
        (tenantParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "calculate_delivery_fee")
          .map((row) => [row.tenant_id, parameterBoolean(row.parameter_value, true)]),
      );
      const storeFreightParameters = new Map(
        (storeParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "calculate_delivery_fee")
          .map((row) => [row.store_id, parameterBoolean(row.parameter_value, true)]),
      );
      const tenantDeliveryFeeTypes = new Map(
        (tenantParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "delivery_fee_type")
          .map((row) => [row.tenant_id, deliveryFeeTypeValue(row.parameter_value)]),
      );
      const storeDeliveryFeeTypes = new Map(
        (storeParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "delivery_fee_type")
          .map((row) => [row.store_id, deliveryFeeTypeValue(row.parameter_value)]),
      );
      const tenantLayoutParameters = new Map(
        (tenantParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "catalog_layout")
          .map((row) => [row.tenant_id, catalogLayoutValue(row.parameter_value)]),
      );
      const storeLayoutParameters = new Map(
        (storeParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "catalog_layout")
          .map((row) => [row.store_id, catalogLayoutValue(row.parameter_value)]),
      );
      const tenantAdditionsParameters = new Map(
        (tenantParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "enable_additions")
          .map((row) => [row.tenant_id, parameterBoolean(row.parameter_value, true)]),
      );
      const storeAdditionsParameters = new Map(
        (storeParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "enable_additions")
          .map((row) => [row.store_id, parameterBoolean(row.parameter_value, true)]),
      );
      const tenantOrderModes = new Map(
        (tenantParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "order_mode")
          .map((row) => [row.tenant_id, orderModeValue(row.parameter_value)]),
      );
      const storeOrderModes = new Map(
        (storeParameterResult.data ?? [])
          .filter((row) => row.parameter_key === "order_mode")
          .map((row) => [row.store_id, orderModeValue(row.parameter_value)]),
      );
      const companyNames = new Map<string, { name: string; themeColor: string; profileImage: string | null }>(
        ((companyResult.data ?? []) as PublicCompanyIdentity[]).map((row) => [row.tenant_id, {
          name: row.company_name,
          themeColor: normalizeThemeColor(row.theme_color),
          profileImage: row.profile_image_url ?? null,
        }]),
      );
      const hasCompanyDirectory = !companyResult.error;
      const optionGroupsByProduct = new Map<string, ProductOptionGroup[]>();
      for (const group of optionGroupResult.data ?? []) {
        for (const link of group.product_option_groups ?? []) {
          const productGroups = optionGroupsByProduct.get(link.product_id) ?? [];
          productGroups.push({
            id: group.id,
            name: group.name,
            minSelections: Number(group.min_selections),
            maxSelections: Number(group.max_selections),
            items: [...(group.option_group_items ?? [])]
              .filter((item) => item.is_active !== false)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((item) => ({ id: item.id, name: item.name, priceDelta: Number(item.price_delta) })),
          });
          optionGroupsByProduct.set(link.product_id, productGroups);
        }
      }

      const loadedMerchants = data.flatMap((store) => {
        if (hasCompanyDirectory && !companyNames.has(store.tenant_id)) return [];
        const demoMerchant = fallbackMerchants.find(
          (item) => item.id === store.slug,
        );
        const baseMerchant = demoMerchant ?? neutralMerchant(store);
        const companyIdentity = companyNames.get(store.tenant_id);
        const companyName = companyIdentity?.name?.trim() || store.name;
        const themeColor = companyIdentity?.themeColor ?? baseMerchant.themeColor;
        const additionsEnabled = storeAdditionsParameters.has(store.id)
          ? storeAdditionsParameters.get(store.id)!
          : tenantAdditionsParameters.get(store.tenant_id) ?? false;

        const categories = [...(store.categories ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order,
        );
        const products = [...(store.products ?? [])]
          .filter((product) => product.is_active)
          .map((product) => {
            const gallery = [...(product.product_images ?? [])]
              .sort((left, right) => left.sort_order - right.sort_order)
              .map((item) => item.image_url)
              .filter(Boolean);
            const primaryImage = gallery[0]
              ?? product.image_url
              ?? demoMerchant?.products.find((item) => item.name === product.name)?.image
              ?? null;
            return {
            id: product.id,
            name: product.name,
            description: product.description ?? "",
            category:
              categories.find((category) => category.id === product.category_id)
                ?.name ?? "Mais pedidos",
            price: Number(product.price),
            image: primaryImage,
            images: gallery.length ? gallery : primaryImage ? [primaryImage] : [],
            badge: product.badge ?? undefined,
            unit: product.unit ?? undefined,
            optionGroups: additionsEnabled ? optionGroupsByProduct.get(product.id) ?? [] : [],
            };
          });

        return [
          {
            ...baseMerchant,
            id: store.slug,
            databaseId: store.id,
            orderMode: storeOrderModes.get(store.id)
              ?? tenantOrderModes.get(store.tenant_id)
              ?? "whatsapp",
            companyName,
            companyProfileImage: companyIdentity?.profileImage ?? null,
            themeColor,
            name: store.name,
            tagline: demoMerchant
              ? baseMerchant.tagline
              : `Catálogo de produtos de ${companyName}.`,
            address: store.address ?? baseMerchant.address,
            latitude: store.latitude == null ? null : Number(store.latitude),
            longitude: store.longitude == null ? null : Number(store.longitude),
            whatsapp: normalizeWhatsapp(store.whatsapp_phone),
            minimumOrder: Number(store.minimum_order),
            deliveryFee: Number(store.delivery_fee),
            deliveryFeeType: storeDeliveryFeeTypes.get(store.id)
              ?? tenantDeliveryFeeTypes.get(store.tenant_id)
              ?? "fixed",
            calculatesDeliveryFee: storeFreightParameters.has(store.id)
              ? storeFreightParameters.get(store.id)!
              : tenantFreightParameters.get(store.tenant_id) ?? true,
            catalogLayout: storeLayoutParameters.get(store.id)
              ?? tenantLayoutParameters.get(store.tenant_id)
              ?? "horizontal",
            deliveryTime: store.delivery_time_label ?? baseMerchant.deliveryTime,
            cover: store.cover_image_url ?? baseMerchant.cover,
            coverNote: typeof store.cover_note === "string" ? store.cover_note.trim() : "",
            palette: themeColor,
            categories: [
              "Mais pedidos",
              ...categories.map((category) => category.name),
            ],
            products,
          },
        ];
      });

      if (loadedMerchants.length) {
        setMerchants(loadedMerchants);
        setActiveStoreId(
          requestedStoreId && loadedMerchants.some((store) => store.id === requestedStoreId)
            ? requestedStoreId
            : "",
        );
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [internalOrderContext?.storeSlug]);

  useEffect(() => {
    const savedCart = window.localStorage.getItem(cartStorageKey)
      ?? (orderChannel === "whatsapp" ? window.localStorage.getItem("catalogo-facil-cart") : null);
    const savedCheckout = window.localStorage.getItem(checkoutStorageKey)
      ?? (orderChannel === "whatsapp" ? window.localStorage.getItem("catalogo-facil-checkout") : null);

    if (savedCart) {
      setCart((JSON.parse(savedCart) as CartItem[]).map((item) => ({ ...item, selectedOptions: item.selectedOptions ?? [] })));
    }

    if (savedCheckout) {
      const restoredCheckout = {
        ...initialCheckout,
        ...(JSON.parse(savedCheckout) as Partial<Checkout>),
      };
      setCheckout(restoredCheckout);
      if (hasCoordinates(restoredCheckout)) {
        setUserLocation({ latitude: restoredCheckout.latitude, longitude: restoredCheckout.longitude });
        setLocationStatus(`Localização ativa · lojas em até ${STORE_RADIUS_KM} km`);
      }
    }
  }, [cartStorageKey, checkoutStorageKey, orderChannel]);

  useEffect(() => {
    window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(checkoutStorageKey, JSON.stringify(checkout));
  }, [checkout, checkoutStorageKey]);

  useEffect(() => {
    setActiveCategory("Mais pedidos");
    setSearch("");
  }, [activeStoreId, directStoreId]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return merchant.products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch);

      return matchesSearch;
    });
  }, [merchant.products, search]);

  const productSections = useMemo<ProductCategorySection[]>(() => {
    const knownCategories = merchant.categories.filter((category) => category !== "Mais pedidos");
    const sections: ProductCategorySection[] = [];

    if (merchant.categories.includes("Mais pedidos")) {
      const popularProducts = filteredProducts.filter((product) => product.badge);
      if (popularProducts.length) sections.push({ category: "Mais pedidos", products: popularProducts });
    }

    for (const category of knownCategories) {
      const products = filteredProducts.filter((product) => product.category === category);
      if (products.length) sections.push({ category, products });
    }

    const listedCategories = new Set(knownCategories);
    const otherProducts = filteredProducts.filter((product) => !listedCategories.has(product.category));
    if (otherProducts.length) sections.push({ category: "Outros", products: otherProducts });

    return sections;
  }, [filteredProducts, merchant.categories]);

  useEffect(() => {
    if (!productSections.length) return;
    if (productSections.some((section) => section.category === activeCategory)) return;
    setActiveCategory(productSections[0].category);
  }, [activeCategory, productSections]);

  useEffect(() => {
    if (!directStoreId || !productSections.length) return;
    const sections = productSections
      .map((section) => document.getElementById(categorySectionId(merchant.id, section.category)))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!sections.length) return;

    let frame = 0;
    const updateActiveCategory = () => {
      if (manualCategoryScrollRef.current) return;

      const categoryStrip = document.querySelector<HTMLElement>(
        ".direct-store-page .catalog-surface > .category-strip",
      );
      const categoryStripStyles = categoryStrip ? window.getComputedStyle(categoryStrip) : null;
      const hasVerticalCategoryNav = categoryStripStyles?.flexDirection === "column";
      const categoryNavTop = Number.parseFloat(categoryStripStyles?.top ?? "0") || 0;
      const activationLine = hasVerticalCategoryNav
        ? categoryNavTop + 56
        : (categoryStrip?.getBoundingClientRect().bottom ?? 0) + 24;
      let currentCategory = sections[0].dataset.category ?? productSections[0].category;

      for (const section of sections) {
        if (section.getBoundingClientRect().top <= activationLine) {
          currentCategory = section.dataset.category ?? currentCategory;
        } else {
          break;
        }
      }

      setActiveCategory((current) => current === currentCategory ? current : currentCategory);
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActiveCategory);
    };
    const finishManualScroll = () => {
      if (!manualCategoryScrollRef.current) return;
      window.clearTimeout(manualCategoryScrollRef.current.timeout);
      manualCategoryScrollRef.current = null;
      scheduleUpdate();
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scrollend", finishManualScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      if (manualCategoryScrollRef.current) {
        window.clearTimeout(manualCategoryScrollRef.current.timeout);
        manualCategoryScrollRef.current = null;
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scrollend", finishManualScroll);
    };
  }, [directStoreId, merchant.id, productSections]);

  useEffect(() => {
    if (!directStoreId) return;

    const presentation = document.querySelector<HTMLElement>(
      ".direct-store-page .merchant-presentation",
    );
    const hero = presentation?.querySelector<HTMLElement>(".merchant-hero");
    if (!presentation || !hero) return;

    let frame = 0;
    const updateCoverPosition = () => {
      frame = 0;
      const scrolled = Math.max(0, -hero.getBoundingClientRect().top);
      const progress = Math.min(scrolled / 180, 1);
      const maximumShift = window.innerWidth <= 760 ? 42 : 50;
      presentation.style.setProperty(
        "--cover-scroll-shift",
        `${Math.round(progress * maximumShift)}px`,
      );
    };
    const scheduleCoverPosition = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCoverPosition);
    };

    updateCoverPosition();
    window.addEventListener("scroll", scheduleCoverPosition, { passive: true });
    window.addEventListener("resize", scheduleCoverPosition);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleCoverPosition);
      window.removeEventListener("resize", scheduleCoverPosition);
      presentation.style.removeProperty("--cover-scroll-shift");
    };
  }, [directStoreId, merchant.id]);

  const cartMerchant = useMemo(
    () => merchants.find((store) => store.id === cart[0]?.merchantId),
    [cart],
  );

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + (item.product.price + item.selectedOptions.reduce((optionsTotal, option) => optionsTotal + option.priceDelta, 0)) * item.quantity,
      0,
    );
    const targetMerchant = cartMerchant ?? merchant;
    const deliveryDistanceKm = fulfillment === "delivery"
      && targetMerchant.deliveryFeeType === "per_km"
      && hasCoordinates(targetMerchant)
      && hasCoordinates(checkout)
      ? distanceInKm(targetMerchant, checkout)
      : null;
    const deliveryFeePending = fulfillment === "delivery" && (
      !targetMerchant.calculatesDeliveryFee
      || (targetMerchant.deliveryFeeType === "per_km" && deliveryDistanceKm === null)
    );
    const delivery = subtotal > 0 && fulfillment === "delivery" && !deliveryFeePending
      ? targetMerchant.deliveryFeeType === "per_km" && deliveryDistanceKm !== null
        ? Math.round(targetMerchant.deliveryFee * deliveryDistanceKm * 100) / 100
        : targetMerchant.deliveryFee
      : 0;

    return {
      subtotal,
      delivery,
      total: subtotal + delivery,
      deliveryDistanceKm,
      deliveryFeePending,
    };
  }, [cart, cartMerchant, checkout.latitude, checkout.longitude, fulfillment, merchant]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartIsFromActiveStore = !cartMerchant || cartMerchant.id === merchant.id;

  const merchantDistances = useMemo(() => {
    const distances = new Map<StoreId, number>();
    if (!userLocation) return distances;
    for (const store of merchants) {
      if (hasCoordinates(store)) distances.set(store.id, distanceInKm(userLocation, store));
    }
    return distances;
  }, [merchants, userLocation]);

  const nearbyMerchants = useMemo(() => {
    const availableMerchants = merchants.filter((store) => orderChannelAvailable(store.orderMode, orderChannel));
    if (!userLocation || showAllStores) return availableMerchants;
    return availableMerchants
      .filter((store) => (merchantDistances.get(store.id) ?? Number.POSITIVE_INFINITY) <= STORE_RADIUS_KM)
      .sort((left, right) => (merchantDistances.get(left.id) ?? 0) - (merchantDistances.get(right.id) ?? 0));
  }, [merchantDistances, merchants, orderChannel, showAllStores, userLocation]);

  const discoveryMerchants = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) return nearbyMerchants;
    return nearbyMerchants.filter((store) => [
      store.companyName,
      store.name,
      store.segment,
      store.tagline,
      ...store.categories,
      ...store.products.map((product) => product.name),
    ].join(" ").toLocaleLowerCase("pt-BR").includes(normalizedSearch));
  }, [nearbyMerchants, search]);

  useEffect(() => {
    if (!isCartOpen) return;
    document.body.classList.add("cart-open");
    return () => document.body.classList.remove("cart-open");
  }, [isCartOpen]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Localização não disponível neste navegador.");
      return;
    }

    if (window.self !== window.top) {
      const opened = window.open(window.location.href, "_blank", "noopener,noreferrer");
      setLocationStatus(opened ? "Página aberta em nova aba. Use a localização novamente nessa aba." : "Abra o catálogo em uma nova aba para liberar a localização.");
      return;
    }

    if (!window.isSecureContext) {
      setLocationStatus("A localização exige uma conexão HTTPS segura.");
      return;
    }

    setLocatingUser(true);
    setLocationStatus("Obtendo sua localização...");
    try {
      let position: GeolocationPosition;
      try {
        position = await requestCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      } catch (firstError) {
        const geolocationError = firstError as GeolocationPositionError;
        if (geolocationError.code === geolocationError.PERMISSION_DENIED) throw geolocationError;
        position = await requestCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 });
      }

      const { coords } = position;
        const currentLocation = { latitude: coords.latitude, longitude: coords.longitude };
        const generatedAddress = `Localização atual (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})`;
        setUserLocation(currentLocation);
        setCheckout((current) => ({
          ...current,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          address: !current.address || current.address.startsWith("Localização atual (") ? generatedAddress : current.address,
        }));
        setShowAllStores(false);
        setLocationStatus(`Localização ativa · lojas em até ${STORE_RADIUS_KM} km`);
        setCheckoutError("");
    } catch (error) {
      setLocationStatus(catalogLocationError(error as GeolocationPositionError));
    } finally {
      setLocatingUser(false);
    }
  }

  function addToCart(product: Product, selectedOptions: SelectedProductOption[] = []) {
    setCart((current) => {
      const currentMerchantId = current[0]?.merchantId;
      const optionKey = selectedOptions.map((option) => option.itemId).sort().join(",");

      if (currentMerchantId && currentMerchantId !== merchant.id) {
        return [{ merchantId: merchant.id, product, quantity: 1, selectedOptions }];
      }

      const existingItem = current.find((item) => item.product.id === product.id && item.selectedOptions.map((option) => option.itemId).sort().join(",") === optionKey);

      if (!existingItem) {
        return [...current, { merchantId: merchant.id, product, quantity: 1, selectedOptions }];
      }

      return current.map((item) =>
        item.product.id === product.id && item.selectedOptions.map((option) => option.itemId).sort().join(",") === optionKey
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      );
    });
  }

  function updateQuantity(productId: string, nextQuantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: nextQuantity }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function openProductOptions(product: Product) {
    setCustomizingProduct(product);
    setSelectedOptionIds([]);
  }

  function confirmProductOptions() {
    if (!customizingProduct) return;
    const selectedOptions = (customizingProduct.optionGroups ?? []).flatMap((group) => group.items.filter((item) => selectedOptionIds.includes(item.id)).map((item) => ({ groupId: group.id, groupName: group.name, itemId: item.id, itemName: item.name, priceDelta: item.priceDelta })));
    const invalidGroup = (customizingProduct.optionGroups ?? []).find((group) => {
      const count = selectedOptions.filter((option) => option.groupId === group.id).length;
      return count < group.minSelections || count > group.maxSelections;
    });
    if (invalidGroup) {
      setCheckoutError(`${invalidGroup.name}: escolha entre ${invalidGroup.minSelections} e ${invalidGroup.maxSelections} opção(ões).`);
      return;
    }
    addToCart(customizingProduct, selectedOptions);
    setCustomizingProduct(null);
    setSelectedOptionIds([]);
    setCheckoutError("");
  }

  function validateOrder() {
    const targetMerchant = cartMerchant ?? merchant;
    if (!cart.length) {
      setCheckoutError("Adicione pelo menos um produto ao pedido.");
      return null;
    }

    const customerNameMode = orderChannel === "whatsapp" ? "required" : internalOrderContext?.customerNameMode ?? "optional";
    if (customerNameMode === "required" && checkout.name.trim().length < 2) {
      setCheckoutError(orderChannel === "internal" ? "Informe o nome do cliente." : "Informe o nome de quem receberá o pedido.");
      return null;
    }
    if (customerNameMode === "optional" && checkout.name.trim().length === 1) {
      setCheckoutError("Informe pelo menos dois caracteres ou deixe o nome em branco.");
      return null;
    }

    if (fulfillment === "delivery" && checkout.address.trim().length < 5 && !hasCoordinates(checkout)) {
      setCheckoutError("Informe o endereço ou use sua localização atual.");
      return null;
    }

    if (fulfillment === "delivery" && targetMerchant.calculatesDeliveryFee && targetMerchant.deliveryFeeType === "per_km") {
      if (!hasCoordinates(targetMerchant)) {
        setCheckoutError("A filial precisa configurar sua localização antes de calcular a entrega por km.");
        return null;
      }
      if (!hasCoordinates(checkout)) {
        setCheckoutError("Use sua localização atual para calcular a taxa de entrega por km.");
        return null;
      }
    }

    if (totals.subtotal < targetMerchant.minimumOrder) {
      setCheckoutError(
        `O pedido mínimo desta filial é ${formatPrice(targetMerchant.minimumOrder)}.`,
      );
      return null;
    }

    if (checkout.payment === "Dinheiro" && checkout.changeFor.trim()) {
      const changeAmount = parseMoney(checkout.changeFor);

      if (changeAmount === null || changeAmount < totals.total) {
        setCheckoutError(
          `O valor para troco deve ser igual ou maior que ${formatPrice(totals.total)}.`,
        );
        return null;
      }
    }

    setCheckoutError("");
    return targetMerchant;
  }

  function sendWhatsappOrder() {
    const targetMerchant = validateOrder();
    if (!targetMerchant) return;
    const createdAt = new Date();
    const message = buildWhatsappMessage({
      merchant: targetMerchant,
      cart,
      checkout,
      fulfillment,
      totals,
      orderCode: createOrderCode(createdAt),
      createdAt,
    });
    const url = `https://wa.me/${targetMerchant.whatsapp}?text=${encodeURIComponent(
      message,
    )}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function sendInternalOrder() {
    const targetMerchant = validateOrder();
    if (!targetMerchant) return;
    if (!supabase || !targetMerchant.databaseId) {
      setCheckoutError("O painel de pedidos ainda não está conectado ao Supabase.");
      return;
    }

    setSubmittingInternalOrder(true);
    if (!internalOrderContext) {
      setCheckoutError("A origem desta comanda não foi identificada. Entre novamente pelo link correto.");
      setSubmittingInternalOrder(false);
      return;
    }
    const { data, error } = await supabase.rpc("create_internal_order_v2", {
      p_store_id: targetMerchant.databaseId,
      p_customer_name: checkout.name.trim() || null,
      p_table_id: internalOrderContext.tableId ?? null,
      p_table_token: internalOrderContext.tableToken ?? null,
      p_order_source: internalOrderContext.source,
      p_fulfillment_mode: fulfillment,
      p_delivery_address: fulfillment === "delivery" ? checkout.address.trim() : targetMerchant.address,
      p_reference: checkout.reference.trim() || null,
      p_service_location: (internalOrderContext.tableLabel ?? checkout.serviceLocation.trim()) || null,
      p_payment_method: checkout.payment,
      p_change_for: checkout.payment === "Dinheiro" ? parseMoney(checkout.changeFor) : null,
      p_notes: checkout.notes.trim() || null,
      p_latitude: checkout.latitude,
      p_longitude: checkout.longitude,
      p_delivery_fee: totals.delivery,
      p_items: cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        selected_options: item.selectedOptions.map((option) => ({
          group_id: option.groupId,
          group_name: option.groupName,
          item_id: option.itemId,
          item_name: option.itemName,
          price_delta: option.priceDelta,
        })),
      })),
    });
    setSubmittingInternalOrder(false);

    if (error) {
      const translatedError = /select a table/i.test(error.message)
        ? "Selecione uma mesa antes de enviar a comanda."
        : /must be opened/i.test(error.message)
          ? "Esta mesa precisa ser aberta por um funcionário antes de receber pedidos."
          : /authenticated staff access/i.test(error.message)
            ? "Sua sessão operacional expirou. Entre novamente."
            : /product group rules|same addition/i.test(error.message)
              ? "Revise os adicionais escolhidos e respeite os limites de cada grupo."
              : /additions are disabled/i.test(error.message)
                ? "Os adicionais foram desativados nesta filial. Atualize o catálogo e tente novamente."
                : error.message;
      setCheckoutError(translatedError || "Não foi possível registrar a comanda.");
      return;
    }

    const order = data as { order_code?: string } | null;
    setInternalOrderCode(order?.order_code ?? "registrada");
    setCart([]);
    setCheckout(initialCheckout);
    setFulfillment(orderChannel === "internal" ? "pickup" : "delivery");
    setIsCartOpen(false);
  }

  function sendOrder() {
    const targetMerchant = cartMerchant ?? merchant;
    if (!orderChannelAvailable(targetMerchant.orderMode, orderChannel)) {
      setCheckoutError(orderChannel === "internal"
        ? "As comandas internas não estão habilitadas para esta filial."
        : "Os pedidos por WhatsApp não estão habilitados para esta filial.");
      return;
    }
    if (orderChannel === "internal") {
      void sendInternalOrder();
      return;
    }
    sendWhatsappOrder();
  }

  function simulateSync(storeId: StoreId) {
    const now = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setSyncLog((current) => ({ ...current, [storeId]: `Hoje, ${now}` }));
  }

  function openCatalog(storeId: StoreId) {
    setActiveStoreId(storeId);
    setView("catalog");
    setIsCartOpen(false);
  }

  function scrollToCategory(category: string) {
    setActiveCategory(category);
    if (manualCategoryScrollRef.current) {
      window.clearTimeout(manualCategoryScrollRef.current.timeout);
    }
    manualCategoryScrollRef.current = {
      category,
      timeout: window.setTimeout(() => {
        manualCategoryScrollRef.current = null;
      }, 1000),
    };

    window.requestAnimationFrame(() => {
      document
        .getElementById(categorySectionId(merchant.id, category))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setView("catalog");
  }

  return (
    <main className={directStoreId ? "shell direct-store-theme" : "shell"} style={directStoreId && displayMerchant ? catalogThemeStyle(displayMerchant.themeColor) : undefined}>
      {!directStoreId ? <header className="topbar">
        <button
          className="brand-lockup"
          onClick={() => setView("catalog")}
          aria-label="Abrir catalogo"
        >
          <span className="brand-mark"><Store size={20} /></span>
          <span>
            <strong>Catalogo Facil</strong>
            <small>{orderChannel === "internal" ? "Comandas internas" : "Catálogos e pedidos"}</small>
          </span>
        </button>

        <button className="location-pill" type="button" onClick={useCurrentLocation} disabled={locatingUser}>
          {locatingUser ? <RefreshCw size={17} /> : <LocateFixed size={17} />}
          <span>{locationStatus || "Usar minha localização"}</span>
          <ChevronRight size={16} />
        </button>

        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar lojas ou produtos"
          />
        </label>

        <div className="topbar-actions">
          <button
            className={view === "catalog" ? "nav-action active" : "nav-action"}
            onClick={() => setView("catalog")}
          >
            <ShoppingCart size={18} />
            <span>Catalogo</span>
          </button>
            <button
              className={view === "admin" ? "nav-action active" : "nav-action"}
              onClick={() => window.location.assign("/acesso")}
          >
            <Settings size={18} />
              <span>Config</span>
            </button>
            {authSession ? (
              <button className="nav-action" onClick={signOut}>
                <LogOut size={18} />
                <span>Sair</span>
              </button>
          ) : null}
        </div>
      </header>
        : null}

      {view === "catalog" ? (
        !merchants.length ? (
          <EmptyCatalog />
        ) : directStoreId && !merchants.some((store) => store.id === directStoreId) ? (
          <StoreNotFound orderChannel={orderChannel} />
        ) : directStoreId && displayMerchant && !orderChannelAvailable(displayMerchant.orderMode, orderChannel) ? (
          <OrderChannelUnavailable orderChannel={orderChannel} />
        ) : (
        <section className={directStoreId ? "direct-store-page" : "commerce-grid discovery"}>
          {!directStoreId ? (
            <StoreDiscovery
              merchants={discoveryMerchants}
              distances={merchantDistances}
              hasLocation={Boolean(userLocation)}
              showingAll={showAllStores}
              orderChannel={orderChannel}
              onToggleAll={() => setShowAllStores((current) => !current)}
            />
          ) : <>
          <MerchantHero merchant={merchantDistances.has(merchant.id) ? { ...merchant, distance: distanceLabel(merchantDistances.get(merchant.id)!) } : merchant} />
          <div className="commerce-grid direct-store">
          <section className="catalog-surface" id="catalogo" key={merchant.id}>
            <nav className="category-strip" aria-label="Categorias">
              <span className="category-nav-title">Categorias</span>
              {productSections.map(({ category }) => {
                return (
                  <button
                    type="button"
                    key={category}
                    className={activeCategory === category ? "active" : ""}
                    aria-current={activeCategory === category ? "true" : undefined}
                    onClick={() => scrollToCategory(category)}
                  >
                    <span>{category}</span>
                  </button>
                );
              })}
            </nav>

            {productSections.length ? (
              <div className="catalog-category-list">
                {productSections.map((section) => (
                  <section
                    className="catalog-category-section"
                    data-category={section.category}
                    id={categorySectionId(merchant.id, section.category)}
                    key={section.category}
                  >
                    <header className="catalog-category-heading">
                      <h2>{section.category}</h2>
                      <span>{section.products.length} {section.products.length === 1 ? "item" : "itens"}</span>
                    </header>

                    <div className={`product-grid ${merchant.catalogLayout}`}>
                      {section.products.map((product) => {
                      const quantity = cart.filter((item) => item.product.id === product.id).reduce((sum, item) => sum + item.quantity, 0);

                      return (
                        <article className="product-card" key={product.id}>
                          <ProductGallery product={product} />
                          <div className="product-content">
                            <div>
                              {product.badge ? (
                                <span className="product-badge">{product.badge}</span>
                              ) : null}
                              <h2>{product.name}</h2>
                              <p>{product.description}</p>
                            </div>
                            <footer>
                              <span className="price-stack">
                                <strong>{formatPrice(product.price)}</strong>
                                {product.unit ? <small>{product.unit}</small> : null}
                              </span>
                              {quantity > 0 ? (
                                <div className="quantity-stepper">
                                  <button
                                    aria-label={`Remover ${product.name}`}
                                    onClick={() =>
                                      updateQuantity(product.id, quantity - 1)
                                    }
                                  >
                                    <Minus size={16} />
                                  </button>
                                  <span>{quantity}</span>
                                  <button
                                    aria-label={`Adicionar ${product.name}`}
                                    onClick={() => product.optionGroups?.length ? openProductOptions(product) : addToCart(product)}
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="add-button"
                                  onClick={() => product.optionGroups?.length ? openProductOptions(product) : addToCart(product)}
                                >
                                  <Plus size={18} />
                                </button>
                              )}
                            </footer>
                          </div>
                        </article>
                      );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="empty-products">
                <Store size={26} />
                <h2>Catálogo sem produtos</h2>
                <p>Cadastre categorias e produtos no painel administrativo para começar a vender.</p>
              </div>
            )}
          </section>

          <CartPanel
            cart={cart}
            cartMerchant={cartMerchant ?? merchant}
            cartIsFromActiveStore={cartIsFromActiveStore}
            checkout={checkout}
            fulfillment={fulfillment}
            orderChannel={orderChannel}
            internalOrderContext={internalOrderContext}
            isCartOpen={isCartOpen}
            totals={totals}
            checkoutError={checkoutError}
            onCheckoutChange={(nextCheckout) => {
              setCheckout(nextCheckout);
              setCheckoutError("");
            }}
            onClose={() => setIsCartOpen(false)}
            onFulfillmentChange={(mode) => {
              setFulfillment(mode);
              setCheckoutError("");
            }}
            onQuantityChange={updateQuantity}
            onSendOrder={sendOrder}
            submittingOrder={submittingInternalOrder}
            locatingUser={locatingUser}
            locationStatus={locationStatus}
            onUseCurrentLocation={useCurrentLocation}
          />
          {internalOrderCode ? (
            <div className="internal-order-success-backdrop" role="presentation">
              <section className="internal-order-success" role="dialog" aria-modal="true" aria-labelledby="internal-order-title">
                <CheckCircle2 size={34} />
                <span>Comanda registrada</span>
                <h2 id="internal-order-title">#{internalOrderCode}</h2>
                <p>O pedido foi enviado para o painel da empresa.</p>
                <button className="whatsapp-button" type="button" onClick={() => setInternalOrderCode("")}>Fechar</button>
              </section>
            </div>
          ) : null}
          {customizingProduct ? <ProductOptionsModal product={customizingProduct} selectedOptionIds={selectedOptionIds} onToggle={(itemId, groupId) => setSelectedOptionIds((current) => { if (current.includes(itemId)) return current.filter((id) => id !== itemId); const group = customizingProduct.optionGroups?.find((item) => item.id === groupId); const withoutGroup = group?.maxSelections === 1 ? current.filter((id) => !group.items.some((item) => item.id === id)) : current; return [...withoutGroup, itemId]; })} onClose={() => setCustomizingProduct(null)} onConfirm={confirmProductOptions} /> : null}
          </div>

          {cartCount > 0 ? (
            <button
              className="mobile-cart-bar"
              onClick={() => setIsCartOpen(true)}
            >
              <span>
                <ShoppingCart size={18} />
                Ver carrinho · {cartCount} {cartCount === 1 ? "item" : "itens"}
              </span>
              <strong>{formatPrice(totals.total)}</strong>
            </button>
          ) : null}
          </>}
        </section>
        )
      ) : (
        authSession ? (
          <AdminPanel
            merchants={merchants}
            syncLog={syncLog}
            onOpenCatalog={(storeId) => {
              openCatalog(storeId);
            }}
            onSync={simulateSync}
          />
        ) : (
          <AdminLogin />
        )
      )}
    </main>
  );
}

export default function Home() {
  return <CatalogApplication orderChannel="whatsapp" />;
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Configure as credenciais do Supabase para continuar.");
      return;
    }

    setBusy(true);
    setMessage("");
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === "signup" && !result.data.session) {
      setMessage("Conta criada. Confirme o e-mail para entrar.");
    }

    setBusy(false);
  }

  return (
    <section className="admin-shell admin-access-shell">
      <div className="admin-heading">
        <div>
          <span>Painel seguro</span>
          <h1>{mode === "login" ? "Entrar no painel" : "Criar acesso administrativo"}</h1>
        </div>
        <ShieldCheck size={28} />
      </div>
      <form className="admin-access-form" onSubmit={submit}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
        </label>
        {message ? <p className="form-message">{message}</p> : null}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      <button className="text-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Ainda não tenho acesso" : "Já tenho uma conta"}
      </button>
    </section>
  );
}

function EmptyCatalog() {
  return (
    <section className="empty-catalog" aria-live="polite">
      <Store size={30} />
      <h1>Nenhum catalogo configurado</h1>
      <p>Cadastre uma empresa e uma filial no painel administrativo para começar.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>
        Atualizar
      </button>
    </section>
  );
}

function StoreNotFound({ orderChannel }: { orderChannel: OrderChannel }) {
  return (
    <section className="empty-catalog" aria-live="polite">
      <Store size={30} />
      <h1>Loja não encontrada</h1>
      <p>Este catálogo não está disponível ou o endereço informado está incorreto.</p>
      <a className="primary-button" href={orderChannel === "internal" ? "/comanda" : "/"}>Ver catálogos disponíveis</a>
    </section>
  );
}

function OrderChannelUnavailable({ orderChannel }: { orderChannel: OrderChannel }) {
  return (
    <section className="empty-catalog" aria-live="polite">
      {orderChannel === "internal" ? <ClipboardList size={30} /> : <MessageCircle size={30} />}
      <h1>{orderChannel === "internal" ? "Comanda interna indisponível" : "Pedidos por WhatsApp indisponíveis"}</h1>
      <p>Esta filial não está habilitada para receber pedidos por este caminho.</p>
    </section>
  );
}

function StoreDiscovery({
  merchants,
  distances,
  hasLocation,
  showingAll,
  orderChannel,
  onToggleAll,
}: {
  merchants: Merchant[];
  distances: Map<StoreId, number>;
  hasLocation: boolean;
  showingAll: boolean;
  orderChannel: OrderChannel;
  onToggleAll: () => void;
}) {
  return (
    <section className="store-discovery">
      <header className="discovery-heading">
        <div><span>Catálogo Fácil</span><h1>{orderChannel === "internal" ? "Catálogos para comanda" : "Lojas e catálogos"}</h1><p>{orderChannel === "internal" ? "Selecione a filial para iniciar uma nova comanda interna." : "Restaurantes, farmácias, materiais de construção e comércios da sua região."}</p></div>
        {hasLocation ? <div className="discovery-radius"><MapPin size={17} /><span>{showingAll ? "Todas as lojas" : `Lojas em até ${STORE_RADIUS_KM} km`}</span><button type="button" onClick={onToggleAll}>{showingAll ? "Ver próximas" : "Ver todas"}</button></div> : null}
      </header>

      <div className="discovery-list-heading"><div><strong>Estabelecimentos disponíveis</strong><small>{merchants.length} {merchants.length === 1 ? "loja encontrada" : "lojas encontradas"}</small></div></div>
      {merchants.length ? (
        <div className="discovery-store-grid">
          {merchants.map((store) => {
            const Icon = iconByMerchant[store.icon];
            const currentDistance = distances.get(store.id);
            const branchName = merchantBranchLabel(store);
            return (
              <a className="discovery-store-card" href={storeCatalogUrl(store.id, orderChannel)} target="_blank" rel="noopener noreferrer" key={store.id} style={{ "--store-color": store.palette } as CSSProperties}>
                <div className="discovery-store-media"><CatalogImage src={store.cover} alt={store.companyName} variant="discovery-store-image" icon="store" /></div>
                <div className="discovery-store-content">
                  <div className="discovery-store-title"><span className={store.companyProfileImage ? "store-avatar company-profile" : "store-avatar"}>{store.companyProfileImage ? <img src={store.companyProfileImage} alt="" /> : <Icon size={20} />}</span><div><h2>{store.companyName}</h2>{branchName ? <span className="discovery-branch-name">{branchName}</span> : null}<small>{store.address}</small></div></div>
                  <p>{store.tagline}</p>
                  <footer><span><Clock size={15} /> {store.deliveryTime}</span>{currentDistance !== undefined ? <span><MapPin size={15} /> {distanceLabel(currentDistance)}</span> : <span><Truck size={15} /> {store.calculatesDeliveryFee ? store.deliveryFeeType === "per_km" ? `${formatPrice(store.deliveryFee)}/km` : formatPrice(store.deliveryFee) : "A combinar"}</span>}</footer>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="discovery-empty"><Search size={24} /><strong>Nenhuma loja encontrada</strong><span>Não encontramos estabelecimentos com os filtros atuais.</span>{hasLocation && !showingAll ? <button type="button" onClick={onToggleAll}>Mostrar todas as lojas</button> : null}</div>
      )}
    </section>
  );
}

function ProductGallery({ product }: { product: Product }) {
  const images = product.images?.length ? product.images : product.image ? [product.image] : [];
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => setActiveImage(0), [product.id, images.length]);

  if (images.length <= 1) {
    return <CatalogImage src={images[0] ?? null} alt={product.name} variant="product-card-image" />;
  }

  return (
    <div className="product-gallery">
      <CatalogImage src={images[activeImage]} alt={`${product.name}, foto ${activeImage + 1}`} variant="product-card-image" />
      <button className="product-gallery-arrow previous" type="button" title="Foto anterior" aria-label={`Foto anterior de ${product.name}`} onClick={() => setActiveImage((current) => (current - 1 + images.length) % images.length)}><ChevronLeft size={17} /></button>
      <button className="product-gallery-arrow next" type="button" title="Próxima foto" aria-label={`Próxima foto de ${product.name}`} onClick={() => setActiveImage((current) => (current + 1) % images.length)}><ChevronRight size={17} /></button>
      <span className="product-gallery-count">{activeImage + 1}/{images.length}</span>
    </div>
  );
}

function ProductOptionsModal({ product, selectedOptionIds, onToggle, onClose, onConfirm }: { product: Product; selectedOptionIds: string[]; onToggle: (itemId: string, groupId: string) => void; onClose: () => void; onConfirm: () => void }) {
  const canConfirm = (product.optionGroups ?? []).every((group) => selectedOptionIds.filter((id) => group.items.some((item) => item.id === id)).length >= group.minSelections);
  return <div className="options-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="options-modal" role="dialog" aria-modal="true" aria-labelledby="options-modal-title"><header><div><span>Personalize seu pedido</span><h2 id="options-modal-title">{product.name}</h2></div><button className="icon-button" type="button" title="Fechar" aria-label="Fechar opções" onClick={onClose}><X size={19} /></button></header><div className="options-modal-body">{(product.optionGroups ?? []).map((group) => { const selectedCount = selectedOptionIds.filter((id) => group.items.some((item) => item.id === id)).length; return <fieldset className="customer-option-group" key={group.id}><legend><strong>{group.name}</strong><small>{group.minSelections > 0 ? `Obrigatório · escolha ${group.maxSelections === 1 ? "1" : `até ${group.maxSelections}`}` : `Opcional · até ${group.maxSelections}`} · {selectedCount} selecionado(s)</small></legend>{group.items.map((item) => <label key={item.id} className={selectedOptionIds.includes(item.id) ? "selected" : ""}><input type={group.maxSelections === 1 ? "radio" : "checkbox"} name={`option-group-${group.id}`} checked={selectedOptionIds.includes(item.id)} onChange={() => { if (!selectedOptionIds.includes(item.id) && group.maxSelections > 1 && selectedCount >= group.maxSelections) return; onToggle(item.id, group.id); }} /><span>{item.name}</span><strong>{item.priceDelta ? `+ ${formatPrice(item.priceDelta)}` : "Grátis"}</strong></label>)}</fieldset>; })}</div><footer><button className="admin-secondary" type="button" onClick={onClose}>Cancelar</button><button className="admin-primary" type="button" onClick={onConfirm} disabled={!canConfirm}><Plus size={17} /> Adicionar ao carrinho</button></footer></section></div>;
}

function CatalogImage({
  src,
  alt,
  variant,
  icon = "product",
}: {
  src: string | null;
  alt: string;
  variant: "merchant-cover" | "discovery-store-image" | "product-card-image" | "cart-item-image";
  icon?: "store" | "product";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return <img className={variant} src={src} alt={alt} onError={() => setFailed(true)} />;
  }

  const Icon = icon === "store" ? Store : Package;
  return <div className={`${variant} catalog-image-placeholder`} role="img" aria-label={`${alt} sem imagem`}><Icon size={variant === "merchant-cover" ? 54 : 28} /></div>;
}

function merchantMapUrl(merchant: Merchant) {
  if (merchant.latitude === null || merchant.longitude === null) return null;

  const latitudeDelta = 0.006;
  const longitudeDelta = 0.008;
  const bbox = [
    merchant.longitude - longitudeDelta,
    merchant.latitude - latitudeDelta,
    merchant.longitude + longitudeDelta,
    merchant.latitude + latitudeDelta,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${merchant.latitude}%2C${merchant.longitude}`;
}

function MerchantHero({ merchant }: { merchant: Merchant }) {
  const branchName = merchantBranchLabel(merchant);
  const mapUrl = merchantMapUrl(merchant);
  const locationUrl = hasCoordinates(merchant) ? mapsUrl(merchant) : null;

  return (
    <section className="merchant-presentation" style={{ "--merchant-color": merchant.palette } as CSSProperties}>
      <div className="merchant-hero">
        <CatalogImage src={merchant.cover} alt={merchant.companyName} variant="merchant-cover" icon="store" />
      </div>
      <div className="merchant-info-card">
        <span className={merchant.companyProfileImage ? "merchant-profile company-profile" : "merchant-profile"}>
          {merchant.companyProfileImage ? (
            <img src={merchant.companyProfileImage} alt={`Logo de ${merchant.companyName}`} />
          ) : (
            <Store size={30} />
          )}
        </span>
        <div className="merchant-info-content">
          <div className="merchant-info-heading">
            <div>
              <h1>{merchant.companyName}</h1>
              {branchName ? <p className="merchant-branch-name">{branchName}</p> : null}
            </div>
          </div>
          <div className="merchant-location-map">
            {mapUrl ? (
              <iframe
                src={mapUrl}
                title={`Mapa da localização de ${merchant.companyName} com marcador da filial`}
                loading="lazy"
              />
            ) : (
              <div className="merchant-location-empty">
                <MapPin size={20} />
                <span>Mapa da filial ainda não configurado</span>
              </div>
            )}
          </div>
          {locationUrl ? (
            <a className="merchant-location-link" href={locationUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir localização de ${merchant.companyName} no Google Maps`}>
              <span className="merchant-location-link-copy"><Navigation size={16} /><span><strong>Abrir localização</strong><small>Google Maps</small></span></span>
              <ExternalLink size={15} />
            </a>
          ) : null}
          {merchant.coverNote ? <p className="merchant-cover-note">{merchant.coverNote}</p> : null}
        </div>
      </div>
    </section>
  );
}

function CartPanel({
  cart,
  cartMerchant,
  cartIsFromActiveStore,
  checkout,
  checkoutError,
  fulfillment,
  orderChannel,
  internalOrderContext,
  isCartOpen,
  totals,
  onCheckoutChange,
  onClose,
  onFulfillmentChange,
  onQuantityChange,
  onSendOrder,
  submittingOrder,
  locatingUser,
  locationStatus,
  onUseCurrentLocation,
}: {
  cart: CartItem[];
  cartMerchant: Merchant;
  cartIsFromActiveStore: boolean;
  checkout: Checkout;
  checkoutError: string;
  fulfillment: FulfillmentMode;
  orderChannel: OrderChannel;
  internalOrderContext?: InternalOrderContext;
  isCartOpen: boolean;
  totals: OrderTotals;
  onCheckoutChange: (checkout: Checkout) => void;
  onClose: () => void;
  onFulfillmentChange: (mode: FulfillmentMode) => void;
  onQuantityChange: (productId: string, nextQuantity: number) => void;
  onSendOrder: () => void;
  submittingOrder: boolean;
  locatingUser: boolean;
  locationStatus: string;
  onUseCurrentLocation: () => void;
}) {
  const [showCheckoutDetails, setShowCheckoutDetails] = useState(false);
  const disabled = cart.length === 0;
  const cartBranchName = merchantBranchLabel(cartMerchant);
  const deliveryFeeLabel = fulfillment === "delivery" && totals.deliveryFeePending
    ? cartMerchant.calculatesDeliveryFee && cartMerchant.deliveryFeeType === "per_km"
      ? "Aguardando localização"
      : "A combinar"
    : formatPrice(totals.delivery);

  function goToCheckout() {
    setShowCheckoutDetails(true);
    window.requestAnimationFrame(() => {
      document.getElementById("cart-checkout")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeCart() {
    setShowCheckoutDetails(false);
    onClose();
  }

  return (
    <>
    <button className={isCartOpen ? "cart-backdrop open" : "cart-backdrop"} type="button" aria-label="Fechar carrinho" onClick={closeCart} />
    <aside className={isCartOpen ? "cart-panel open" : "cart-panel"} aria-label="Carrinho e finalização do pedido">
      <div className="cart-header">
        <div>
          <strong>{cartMerchant.companyName}</strong>
          {cartBranchName ? <small>{cartBranchName}</small> : null}
        </div>
        <button className="icon-button mobile-only" onClick={closeCart}>
          <X size={20} />
        </button>
      </div>

      <div className="cart-scroll-area">
      {orderChannel === "internal" && internalOrderContext ? (
        <div className="internal-command-context">
          <span><ClipboardList size={16} /></span>
          <div><strong>{internalOrderContext.tableLabel || "Comanda da filial"}</strong><small>{internalOrderContext.source === "staff" ? internalOrderContext.actorName ? `Responsável: ${internalOrderContext.actorName}` : "Funcionário autenticado" : "Dispositivo vinculado à mesa"}</small></div>
        </div>
      ) : null}
      {!cartIsFromActiveStore ? (
        <div className="cart-warning">
          Pedido iniciado em {cartMerchant.companyName}{cartBranchName ? `, filial ${cartBranchName}` : ""}.
        </div>
      ) : null}

      <div className="cart-section-heading"><div><strong>Produtos</strong><small>Revise os itens antes de continuar.</small></div><span>{cart.length} {cart.length === 1 ? "item" : "itens"}</span></div>
      <div className="cart-items">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <strong>Seu carrinho esta vazio</strong>
            <span>Escolha os produtos para montar a comanda.</span>
          </div>
        ) : (
          cart.map((item) => (
            <div className="cart-item" key={item.product.id}>
              <CatalogImage src={item.product.image} alt={item.product.name} variant="cart-item-image" />
              <div>
                <strong>{item.product.name}</strong>
                <span className="cart-item-price">
                  {formatPrice(item.product.price + item.selectedOptions.reduce((sum, option) => sum + option.priceDelta, 0))}
                  {item.product.unit ? ` / ${item.product.unit}` : ""}
                </span>
                {item.selectedOptions.length ? (
                  <div className="cart-item-options" aria-label="Adicionais selecionados">
                    <span className="cart-item-options-label">Adicionais</span>
                    <ul>
                      {item.selectedOptions.map((option) => (
                        <li key={`${option.groupId}-${option.itemId}`}>
                          <span>{option.groupName ? `${option.groupName}: ` : ""}{option.itemName}</span>
                          <strong>{formatOptionDelta(option.priceDelta)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="cart-stepper">
                <button
                  aria-label={`Diminuir ${item.product.name}`}
                  onClick={() =>
                    onQuantityChange(item.product.id, item.quantity - 1)
                  }
                >
                  {item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                </button>
                <span>{item.quantity}</span>
                <button
                  aria-label={`Aumentar ${item.product.name}`}
                  onClick={() =>
                    onQuantityChange(item.product.id, item.quantity + 1)
                  }
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={showCheckoutDetails ? "cart-section-heading delivery-section-heading expanded" : "cart-section-heading delivery-section-heading"}><div><strong>{orderChannel === "internal" ? "Detalhes da comanda" : "Detalhes da entrega"}</strong><small>{showCheckoutDetails ? "Confira os dados antes de enviar." : "Clique em Continuar para preencher os dados."}</small></div></div>
      {showCheckoutDetails ? <div className="checkout-block" id="cart-checkout">
        {orderChannel === "whatsapp" ? (
          <div className="segmented-control">
            <button
              className={fulfillment === "delivery" ? "active" : ""}
              onClick={() => onFulfillmentChange("delivery")}
            >
              <Truck size={16} />
              Entrega
            </button>
            <button
              className={fulfillment === "pickup" ? "active" : ""}
              onClick={() => onFulfillmentChange("pickup")}
            >
              <Store size={16} />
              Retirada
            </button>
          </div>
        ) : null}

        {orderChannel === "whatsapp" || internalOrderContext?.customerNameMode !== "hidden" ? (
          <label>
            <User size={16} />
            <input
              value={checkout.name}
              onChange={(event) =>
                onCheckoutChange({ ...checkout, name: event.target.value })
              }
              placeholder={orderChannel === "internal" && internalOrderContext?.customerNameMode !== "required" ? "Nome do cliente (opcional)" : "Nome"}
              autoComplete="name"
              aria-invalid={Boolean(checkoutError && checkout.name.trim().length < 2)}
            />
          </label>
        ) : null}

        {orderChannel === "whatsapp" && fulfillment === "delivery" ? (
          <button className="checkout-location-button" type="button" onClick={onUseCurrentLocation} disabled={locatingUser}>
            {locatingUser ? <RefreshCw size={17} /> : <LocateFixed size={17} />}
            {locatingUser ? "Obtendo localização..." : hasCoordinates(checkout) ? "Atualizar minha localização" : "Usar minha localização"}
          </button>
        ) : null}

        {orderChannel === "whatsapp" && fulfillment === "delivery" && hasCoordinates(checkout) ? (
          <div className="checkout-location-confirmation">
            <CheckCircle2 size={16} />
            <span>Localização anexada à comanda</span>
            <a href={mapsUrl(checkout)} target="_blank" rel="noreferrer">Ver mapa</a>
          </div>
        ) : orderChannel === "whatsapp" && fulfillment === "delivery" && locationStatus ? (
          <p className="location-feedback">{locationStatus}</p>
        ) : null}

        {orderChannel === "whatsapp" && fulfillment === "delivery" && cartMerchant.calculatesDeliveryFee && cartMerchant.deliveryFeeType === "per_km" ? (
          totals.deliveryDistanceKm !== null ? (
            <div className="checkout-delivery-calculation">
              <Truck size={17} />
              <span><strong>{distanceLabel(totals.deliveryDistanceKm)} estimados</strong><small>{formatPrice(cartMerchant.deliveryFee)} por km</small></span>
              <b>{formatPrice(totals.delivery)}</b>
            </div>
          ) : (
            <p className="checkout-delivery-guidance">{hasCoordinates(cartMerchant) ? "Use sua localização para calcular automaticamente a taxa de entrega." : "Esta filial precisa configurar sua localização para calcular a entrega por km."}</p>
          )
        ) : null}

        {orderChannel === "whatsapp" ? fulfillment === "delivery" ? (
            <label>
              <MapPin size={16} />
              <input
                value={checkout.address}
                onChange={(event) =>
                  onCheckoutChange({ ...checkout, address: event.target.value })
                }
                placeholder="Rua, número e bairro"
                autoComplete="street-address"
                aria-invalid={Boolean(
                  checkoutError && checkout.address.trim().length < 5 && !hasCoordinates(checkout),
                )}
              />
            </label>
          ) : (
            <div className="pickup-address">
              <MapPin size={16} />
              <span>{cartMerchant.address}</span>
              {hasCoordinates(cartMerchant) ? <a href={mapsUrl(cartMerchant)} target="_blank" rel="noreferrer">Ver mapa</a> : null}
            </div>
          ) : null}

        {orderChannel === "whatsapp" && fulfillment === "delivery" ? (
          <label>
            <MapPin size={16} />
            <input
              value={checkout.reference}
              onChange={(event) =>
                onCheckoutChange({ ...checkout, reference: event.target.value })
              }
              placeholder="Complemento ou referência (opcional)"
            />
          </label>
        ) : null}

        <label>
          <CreditCard size={16} />
          <select
            value={checkout.payment}
            onChange={(event) =>
              onCheckoutChange({ ...checkout, payment: event.target.value })
            }
          >
            <option>Pix</option>
            <option>Cartao na entrega</option>
            <option>Dinheiro</option>
            <option>Link de pagamento</option>
          </select>
        </label>

        {checkout.payment === "Dinheiro" ? (
          <label>
            <CreditCard size={16} />
            <input
              value={checkout.changeFor}
              onChange={(event) =>
                onCheckoutChange({ ...checkout, changeFor: event.target.value })
              }
              placeholder="Troco para (opcional)"
              inputMode="decimal"
              aria-invalid={Boolean(
                checkoutError &&
                  checkout.changeFor.trim() &&
                  (parseMoney(checkout.changeFor) ?? 0) < totals.total,
              )}
            />
          </label>
        ) : null}

        <textarea
          value={checkout.notes}
          onChange={(event) =>
            onCheckoutChange({ ...checkout, notes: event.target.value })
          }
          placeholder="Observações para o pedido (opcional)"
        />

        {checkoutError ? (
          <p className="checkout-error" role="alert">
            {checkoutError}
          </p>
        ) : null}
      </div> : null}
      </div>

      <div className="cart-footer">
      <div className="cart-total">
        <span>
          Subtotal <strong>{formatPrice(totals.subtotal)}</strong>
        </span>
        {fulfillment === "delivery" ? (
          <span>
            {totals.deliveryDistanceKm !== null ? `Taxa (${distanceLabel(totals.deliveryDistanceKm)} estimados)` : "Taxa"} <strong>{deliveryFeeLabel}</strong>
          </span>
        ) : null}
        <span className="grand-total">
          {totals.deliveryFeePending ? "Total parcial" : "Total"} <strong>{formatPrice(totals.total)}</strong>
        </span>
      </div>

          <button className="whatsapp-button" disabled={disabled || submittingOrder} onClick={showCheckoutDetails ? onSendOrder : goToCheckout}>
            {showCheckoutDetails ? orderChannel === "internal" ? <ClipboardList size={19} /> : <MessageCircle size={19} /> : <ChevronRight size={19} />}
            {showCheckoutDetails ? orderChannel === "internal" ? submittingOrder ? "Registrando..." : "Enviar comanda" : "Enviar pelo WhatsApp" : "Continuar"}
          </button>
      </div>
    </aside>
    </>
  );
}

function AdminPanel({
  merchants,
  syncLog,
  onOpenCatalog,
  onSync,
}: {
  merchants: Merchant[];
  syncLog: Record<StoreId, string>;
  onOpenCatalog: (storeId: StoreId) => void;
  onSync: (storeId: StoreId) => void;
}) {
  return (
    <section className="admin-shell">
      <CompanySetupForm />
      <div className="admin-heading">
        <div>
          <span>Painel interno</span>
          <h1>Configuracao dos catalogos</h1>
        </div>
        <button className="primary-outline">
          <ShieldCheck size={18} />
          Supabase pronto
        </button>
      </div>

      <div className="admin-metrics">
        <article>
          <span>Lojas</span>
          <strong>{merchants.length}</strong>
        </article>
        <article>
          <span>Produtos</span>
          <strong>
            {merchants.reduce((sum, store) => sum + store.products.length, 0)}
          </strong>
        </article>
        <article>
          <span>Conectores</span>
          <strong>3</strong>
        </article>
        <article>
          <span>Pedidos</span>
          <strong>WhatsApp</strong>
        </article>
      </div>

      <div className="integration-grid">
        {merchants.map((store) => {
          const Icon = iconByMerchant[store.icon];

          return (
            <article className="integration-card" key={store.id}>
              <header>
                <span
                  className="integration-icon"
                  style={{ "--store-color": store.palette } as CSSProperties}
                >
                  <Icon size={20} />
                </span>
                <div>
                  <strong>{store.name}</strong>
                  <small>{store.integration.mode}</small>
                </div>
                <span className={`status status-${store.integration.status.toLowerCase()}`}>
                  {store.integration.status}
                </span>
              </header>

              <dl>
                <div>
                  <dt>Origem</dt>
                  <dd>{store.integration.source}</dd>
                </div>
                <div>
                  <dt>Rotina</dt>
                  <dd>{store.integration.cadence}</dd>
                </div>
                <div>
                  <dt>Atualizado</dt>
                  <dd>{syncLog[store.id]}</dd>
                </div>
              </dl>

              <footer>
                <button onClick={() => onSync(store.id)}>
                  <RefreshCw size={17} />
                  Atualizar precos
                </button>
                <button onClick={() => onOpenCatalog(store.id)}>
                  <Store size={17} />
                  Catalogo
                </button>
              </footer>
            </article>
          );
        })}
      </div>

      <section className="roadmap-panel">
        <header>
          <ClipboardList size={20} />
          <strong>Base Supabase</strong>
        </header>
        <div className="schema-list">
          <span>tenants</span>
          <span>stores</span>
          <span>products</span>
          <span>integration_sources</span>
          <span>sync_jobs</span>
          <span>orders</span>
        </div>
      </section>
    </section>
  );
}

function CompanySetupForm() {
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchSlug, setBranchSlug] = useState("");
  const [branchPhone, setBranchPhone] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setMessage("");
    const { data: tenantId, error: tenantError } = await supabase.rpc(
      "create_tenant_with_owner",
      {
        tenant_name: companyName,
        tenant_slug: companySlug,
        owner_name: null,
        owner_phone: null,
      },
    );

    if (tenantError || !tenantId) {
      setMessage(tenantError?.message ?? "Não foi possível criar a empresa.");
      setBusy(false);
      return;
    }

    const { error: storeError } = await supabase.from("stores").insert({
      tenant_id: tenantId,
      name: branchName,
      slug: branchSlug,
      segment: "retail",
      whatsapp_phone: normalizeWhatsapp(branchPhone),
      address: branchAddress,
      is_active: true,
    });

    setMessage(
      storeError
        ? storeError.message
        : "Empresa e primeira filial cadastradas. Atualize o catálogo para carregar os dados.",
    );
    setBusy(false);
  }

  return (
    <form className="setup-panel" onSubmit={createCompany}>
      <div>
        <span className="panel-kicker">Primeiro cadastro</span>
        <h2>Cadastrar empresa e filial</h2>
        <p>Depois você poderá adicionar produtos e usuários da filial.</p>
      </div>
      <div className="setup-grid">
        <label>
          Empresa
          <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Ex.: Material Forte" required />
        </label>
        <label>
          Identificador da empresa
          <input value={companySlug} onChange={(event) => setCompanySlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="material-forte" required />
        </label>
        <label>
          Primeira filial
          <input value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="Ex.: Filial Centro" required />
        </label>
        <label>
          Identificador da filial
          <input value={branchSlug} onChange={(event) => setBranchSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="filial-centro" required />
        </label>
        <label>
          WhatsApp da filial
          <input value={branchPhone} onChange={(event) => setBranchPhone(formatWhatsapp(event.target.value))} inputMode="tel" placeholder="(63) 99999-9999" required />
        </label>
        <label>
          Endereço
          <input value={branchAddress} onChange={(event) => setBranchAddress(event.target.value)} placeholder="Rua e número" required />
        </label>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
      <button className="primary-button setup-submit" type="submit" disabled={busy}>
        {busy ? "Salvando..." : "Salvar empresa e filial"}
      </button>
    </form>
  );
}
