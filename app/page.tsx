"use client";

import {
  BadgePercent,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  Hammer,
  HeartPulse,
  Home,
  LocateFixed,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Pill,
  Pizza,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type StoreId = string;
type ViewMode = "catalog" | "admin";
type FulfillmentMode = "delivery" | "pickup";

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string | null;
  badge?: string;
  unit?: string;
};

type CatalogLayout = "horizontal" | "showcase";

type Merchant = {
  id: StoreId;
  name: string;
  segment: string;
  tagline: string;
  rating: number | null;
  distance: string | null;
  deliveryTime: string;
  minimumOrder: number;
  deliveryFee: number;
  calculatesDeliveryFee: boolean;
  catalogLayout: CatalogLayout;
  whatsapp: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  cover: string | null;
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
};

type Checkout = {
  name: string;
  address: string;
  reference: string;
  payment: string;
  changeFor: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

type Coordinates = { latitude: number; longitude: number };

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

function catalogLayoutValue(value: unknown, fallback: CatalogLayout = "horizontal"): CatalogLayout {
  return value === "horizontal" || value === "showcase" ? value : fallback;
}

function requestCurrentPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

function catalogLocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Localização bloqueada. No Chrome, clique no cadeado ao lado do endereço, permita Localização e recarregue a página.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Ative a localização do aparelho e tente novamente.";
  if (error.code === error.TIMEOUT) return "A localização demorou para responder. Verifique o GPS ou Wi-Fi e tente novamente.";
  return "Não foi possível obter sua localização.";
}

function storeCatalogUrl(storeId: StoreId) {
  return `/?loja=${encodeURIComponent(storeId)}`;
}

function normalizeWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

const fallbackMerchants: Merchant[] = [
  {
    id: "bella-massa",
    name: "Bella Massa Pizzaria",
    segment: "Pizzaria",
    tagline: "Pizzas artesanais, borda recheada e combos da noite.",
    rating: 4.8,
    distance: "1,6 km",
    deliveryTime: "35-45 min",
    minimumOrder: 25,
    deliveryFee: 5.99,
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "5599999990001",
    address: "Av. Central, 320",
    latitude: -7.1908,
    longitude: -48.2073,
    cover:
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1400&q=80",
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
    name: "Farmacia Vida",
    segment: "Farmacia",
    tagline: "Medicamentos, dermocosmeticos e itens de cuidado diario.",
    rating: 4.9,
    distance: "900 m",
    deliveryTime: "20-30 min",
    minimumOrder: 15,
    deliveryFee: 3.99,
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "5599999990002",
    address: "Rua das Flores, 88",
    latitude: -7.1842,
    longitude: -48.2101,
    cover:
      "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1400&q=80",
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
    name: "Construmais Obras",
    segment: "Material de construcao",
    tagline:
      "Cimento, areia, tijolo, hidraulica, eletrica e acabamento com entrega por rota.",
    rating: 4.6,
    distance: "2,4 km",
    deliveryTime: "2-4 h",
    minimumOrder: 80,
    deliveryFee: 18,
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "5599999990003",
    address: "Av. Filadelfia, 1280 - Setor Industrial",
    latitude: -7.2056,
    longitude: -48.2254,
    cover:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1400&q=80",
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
    name: store.name,
    segment: segmentLabels[store.segment ?? ""] ?? "Comércio",
    tagline: `Catálogo de produtos de ${store.name}.`,
    rating: null,
    distance: null,
    deliveryTime: "Consulte a filial",
    minimumOrder: 0,
    deliveryFee: 0,
    calculatesDeliveryFee: true,
    catalogLayout: "horizontal",
    whatsapp: "",
    address: "Endereço não informado",
    latitude: store.latitude == null ? null : Number(store.latitude),
    longitude: store.longitude == null ? null : Number(store.longitude),
    cover: null,
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

const categoryIcons = {
  "Mais pedidos": BadgePercent,
  Pizzas: Pizza,
  Combos: ClipboardList,
  Bebidas: ShoppingCart,
  Medicamentos: Pill,
  Higiene: ShieldCheck,
  Dermocosmeticos: HeartPulse,
  Cimento: Home,
  "Obra grossa": Home,
  Hidraulica: SlidersHorizontal,
  Ferramentas: Hammer,
  Eletrica: SlidersHorizontal,
  Tintas: BadgePercent,
};

const initialCheckout: Checkout = {
  name: "",
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
  totals: { subtotal: number; delivery: number; total: number };
  orderCode: string;
  createdAt: Date;
}) {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const items = cart
    .map(
      (item, index) => {
        const unit = item.product.unit
          ? `\n   Unidade: ${cleanOrderText(item.product.unit)}`
          : "";

        return `${String(index + 1).padStart(2, "0")}. *${cleanOrderText(
          item.product.name,
        )}*\n   ${item.quantity} x ${formatPrice(
          item.product.price,
        )} = *${formatPrice(item.product.price * item.quantity)}*${unit}`;
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
  const deliveryIsPending = fulfillment === "delivery" && !merchant.calculatesDeliveryFee;
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
    `*${cleanOrderText(merchant.name)}*`,
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
    `Subtotal: ${formatPrice(totals.subtotal)}`,
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

export default function Home() {
  const [merchants, setMerchants] = useState<Merchant[]>(
    hasSupabaseConfig ? [] : fallbackMerchants,
  );
  const [activeStoreId, setActiveStoreId] = useState<StoreId>("");
  const [activeCategory, setActiveCategory] = useState("Mais pedidos");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("catalog");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("delivery");
  const [checkout, setCheckout] = useState<Checkout>(initialCheckout);
  const [checkoutError, setCheckoutError] = useState("");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [locatingUser, setLocatingUser] = useState(false);
  const [showAllStores, setShowAllStores] = useState(false);
  const [directStoreId, setDirectStoreId] = useState<StoreId | null>(null);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [syncLog, setSyncLog] = useState<Record<StoreId, string>>({
    "bella-massa": fallbackMerchants[0].integration.lastSync,
    "farmacia-vida": fallbackMerchants[1].integration.lastSync,
    construmais: fallbackMerchants[2].integration.lastSync,
  });

  const merchant =
    merchants.find((store) => store.id === activeStoreId) ??
    merchants[0] ??
    fallbackMerchants[0];

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
      const requestedStoreId = new URLSearchParams(window.location.search).get("loja")?.trim() || null;
      setDirectStoreId(requestedStoreId);

      const [storeResult, tenantParameterResult, storeParameterResult] = await Promise.all([
        supabase
          .from("stores")
          .select("*, categories(*), products(*)")
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("tenant_parameters")
          .select("tenant_id, parameter_key, parameter_value")
          .in("parameter_key", ["calculate_delivery_fee", "catalog_layout"]),
        supabase
          .from("store_parameters")
          .select("store_id, parameter_key, parameter_value")
          .in("parameter_key", ["calculate_delivery_fee", "catalog_layout"]),
      ]);
      const { data, error } = storeResult;

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

      const loadedMerchants = data.flatMap((store) => {
        const demoMerchant = fallbackMerchants.find(
          (item) => item.id === store.slug,
        );
        const baseMerchant = demoMerchant ?? neutralMerchant(store);

        const categories = [...(store.categories ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order,
        );
        const products = [...(store.products ?? [])]
          .filter((product) => product.is_active)
          .map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description ?? "",
            category:
              categories.find((category) => category.id === product.category_id)
                ?.name ?? "Mais pedidos",
            price: Number(product.price),
            image:
              product.image_url ??
              demoMerchant?.products.find((item) => item.name === product.name)
                ?.image ?? null,
            badge: product.badge ?? undefined,
            unit: product.unit ?? undefined,
          }));

        return [
          {
            ...baseMerchant,
            id: store.slug,
            name: store.name,
            address: store.address ?? baseMerchant.address,
            latitude: store.latitude == null ? null : Number(store.latitude),
            longitude: store.longitude == null ? null : Number(store.longitude),
            whatsapp: normalizeWhatsapp(store.whatsapp_phone),
            minimumOrder: Number(store.minimum_order),
            deliveryFee: Number(store.delivery_fee),
            calculatesDeliveryFee: storeFreightParameters.has(store.id)
              ? storeFreightParameters.get(store.id)!
              : tenantFreightParameters.get(store.tenant_id) ?? true,
            catalogLayout: storeLayoutParameters.get(store.id)
              ?? tenantLayoutParameters.get(store.tenant_id)
              ?? "horizontal",
            deliveryTime: store.delivery_time_label ?? baseMerchant.deliveryTime,
            cover: store.cover_image_url ?? baseMerchant.cover,
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
  }, []);

  useEffect(() => {
    const savedCart = window.localStorage.getItem("catalogo-facil-cart");
    const savedCheckout = window.localStorage.getItem(
      "catalogo-facil-checkout",
    );

    if (savedCart) {
      setCart(JSON.parse(savedCart) as CartItem[]);
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
  }, []);

  useEffect(() => {
    window.localStorage.setItem("catalogo-facil-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    window.localStorage.setItem(
      "catalogo-facil-checkout",
      JSON.stringify(checkout),
    );
  }, [checkout]);

  useEffect(() => {
    setActiveCategory("Mais pedidos");
    setSearch("");
  }, [activeStoreId]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return merchant.products.filter((product) => {
      const matchesCategory =
        activeCategory === "Mais pedidos" ||
        product.category === activeCategory ||
        product.badge;
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.description.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, merchant, search]);

  const cartMerchant = useMemo(
    () => merchants.find((store) => store.id === cart[0]?.merchantId),
    [cart],
  );

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const deliveryFee = cartMerchant?.deliveryFee ?? merchant.deliveryFee;
    const calculatesDeliveryFee = cartMerchant?.calculatesDeliveryFee ?? merchant.calculatesDeliveryFee;
    const delivery = subtotal > 0 && fulfillment === "delivery" && calculatesDeliveryFee ? deliveryFee : 0;

    return {
      subtotal,
      delivery,
      total: subtotal + delivery,
    };
  }, [cart, cartMerchant?.calculatesDeliveryFee, cartMerchant?.deliveryFee, fulfillment, merchant.calculatesDeliveryFee, merchant.deliveryFee]);

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
    if (!userLocation || showAllStores) return merchants;
    return merchants
      .filter((store) => (merchantDistances.get(store.id) ?? Number.POSITIVE_INFINITY) <= STORE_RADIUS_KM)
      .sort((left, right) => (merchantDistances.get(left.id) ?? 0) - (merchantDistances.get(right.id) ?? 0));
  }, [merchantDistances, merchants, showAllStores, userLocation]);

  const discoveryMerchants = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) return nearbyMerchants;
    return nearbyMerchants.filter((store) => [
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
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: "geolocation" });
          if (permission.state === "denied") {
            setLocationStatus("Localização bloqueada no Chrome. Clique no cadeado ao lado do endereço, permita Localização e recarregue a página.");
            setLocatingUser(false);
            return;
          }
        } catch {
          // Continue with the Geolocation API when permission introspection is unavailable.
        }
      }

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

  function addToCart(product: Product) {
    setCart((current) => {
      const currentMerchantId = current[0]?.merchantId;

      if (currentMerchantId && currentMerchantId !== merchant.id) {
        return [{ merchantId: merchant.id, product, quantity: 1 }];
      }

      const existingItem = current.find((item) => item.product.id === product.id);

      if (!existingItem) {
        return [...current, { merchantId: merchant.id, product, quantity: 1 }];
      }

      return current.map((item) =>
        item.product.id === product.id
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

  function sendWhatsappOrder() {
    const targetMerchant = cartMerchant ?? merchant;
    if (!cart.length) {
      setCheckoutError("Adicione pelo menos um produto ao pedido.");
      return;
    }

    if (checkout.name.trim().length < 2) {
      setCheckoutError("Informe o nome de quem receberá o pedido.");
      return;
    }

    if (fulfillment === "delivery" && checkout.address.trim().length < 5 && !hasCoordinates(checkout)) {
      setCheckoutError("Informe o endereço ou use sua localização atual.");
      return;
    }

    if (totals.subtotal < targetMerchant.minimumOrder) {
      setCheckoutError(
        `O pedido mínimo desta filial é ${formatPrice(targetMerchant.minimumOrder)}.`,
      );
      return;
    }

    if (checkout.payment === "Dinheiro" && checkout.changeFor.trim()) {
      const changeAmount = parseMoney(checkout.changeFor);

      if (changeAmount === null || changeAmount < totals.total) {
        setCheckoutError(
          `O valor para troco deve ser igual ou maior que ${formatPrice(totals.total)}.`,
        );
        return;
      }
    }

    setCheckoutError("");
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

  async function signOut() {
    await supabase?.auth.signOut();
    setView("catalog");
  }

  return (
    <main className="shell">
      <header className={directStoreId ? "topbar direct-store-topbar" : "topbar"}>
        <button
          className="brand-lockup"
          onClick={() => directStoreId ? window.location.assign("/") : setView("catalog")}
          aria-label="Abrir catalogo"
        >
          <span className="brand-mark">
            <Store size={20} />
          </span>
          <span>
            <strong>Catalogo Facil</strong>
            <small>Pedidos por WhatsApp</small>
          </span>
        </button>

        {!directStoreId ? <button className="location-pill" type="button" onClick={useCurrentLocation} disabled={locatingUser}>
          {locatingUser ? <RefreshCw size={17} /> : <LocateFixed size={17} />}
          <span>{locationStatus || "Usar minha localização"}</span>
          <ChevronRight size={16} />
        </button> : null}

        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={directStoreId ? `Buscar em ${merchant.name}` : "Buscar lojas ou produtos"}
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

      {view === "catalog" ? (
        !merchants.length ? (
          <EmptyCatalog />
        ) : directStoreId && !merchants.some((store) => store.id === directStoreId) ? (
          <StoreNotFound />
        ) : (
        <section className={directStoreId ? "commerce-grid direct-store" : "commerce-grid discovery"}>
          {!directStoreId ? (
            <StoreDiscovery
              merchants={discoveryMerchants}
              distances={merchantDistances}
              hasLocation={Boolean(userLocation)}
              showingAll={showAllStores}
              onToggleAll={() => setShowAllStores((current) => !current)}
            />
          ) : <>
          <section className="catalog-surface" id="catalogo" key={merchant.id}>
            <MerchantHero merchant={merchantDistances.has(merchant.id) ? { ...merchant, distance: distanceLabel(merchantDistances.get(merchant.id)!) } : merchant} />

            <nav className="category-strip" aria-label="Categorias">
              {merchant.categories.map((category) => {
                const CategoryIcon =
                  categoryIcons[category as keyof typeof categoryIcons] ??
                  ClipboardList;

                return (
                  <button
                    key={category}
                    className={activeCategory === category ? "active" : ""}
                    onClick={() => setActiveCategory(category)}
                  >
                    <CategoryIcon size={17} />
                    <span>{category}</span>
                  </button>
                );
              })}
            </nav>

            <div className="section-title">
              <div>
                <span>{filteredProducts.length} itens</span>
                <h1>{activeCategory}</h1>
              </div>
              <button className="filter-button">
                <SlidersHorizontal size={17} />
                <span>Filtros</span>
              </button>
            </div>

            {filteredProducts.length ? (
              <div className={`product-grid ${merchant.catalogLayout}`}>
                {filteredProducts.map((product) => {
                const quantity =
                  cart.find((item) => item.product.id === product.id)?.quantity ??
                  0;

                return (
                  <article className="product-card" key={product.id}>
                    <CatalogImage src={product.image} alt={product.name} variant="product-card-image" />
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
                              onClick={() => addToCart(product)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            className="add-button"
                            onClick={() => addToCart(product)}
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
            onSendOrder={sendWhatsappOrder}
            locatingUser={locatingUser}
            locationStatus={locationStatus}
            onUseCurrentLocation={useCurrentLocation}
          />

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

function StoreNotFound() {
  return (
    <section className="empty-catalog" aria-live="polite">
      <Store size={30} />
      <h1>Loja não encontrada</h1>
      <p>Este catálogo não está disponível ou o endereço informado está incorreto.</p>
      <a className="primary-button" href="/">Ver todas as lojas</a>
    </section>
  );
}

function StoreDiscovery({
  merchants,
  distances,
  hasLocation,
  showingAll,
  onToggleAll,
}: {
  merchants: Merchant[];
  distances: Map<StoreId, number>;
  hasLocation: boolean;
  showingAll: boolean;
  onToggleAll: () => void;
}) {
  return (
    <section className="store-discovery">
      <header className="discovery-heading">
        <div><span>Catálogo Fácil</span><h1>Lojas e catálogos</h1><p>Restaurantes, farmácias, materiais de construção e comércios da sua região.</p></div>
        {hasLocation ? <div className="discovery-radius"><MapPin size={17} /><span>{showingAll ? "Todas as lojas" : `Lojas em até ${STORE_RADIUS_KM} km`}</span><button type="button" onClick={onToggleAll}>{showingAll ? "Ver próximas" : "Ver todas"}</button></div> : null}
      </header>

      <div className="discovery-list-heading"><div><strong>Estabelecimentos disponíveis</strong><small>{merchants.length} {merchants.length === 1 ? "loja encontrada" : "lojas encontradas"}</small></div></div>
      {merchants.length ? (
        <div className="discovery-store-grid">
          {merchants.map((store) => {
            const Icon = iconByMerchant[store.icon];
            const currentDistance = distances.get(store.id);
            return (
              <a className="discovery-store-card" href={storeCatalogUrl(store.id)} target="_blank" rel="noopener noreferrer" key={store.id} style={{ "--store-color": store.palette } as CSSProperties}>
                <div className="discovery-store-media"><CatalogImage src={store.cover} alt={store.name} variant="discovery-store-image" icon="store" /><span>{store.segment}</span></div>
                <div className="discovery-store-content">
                  <div className="discovery-store-title"><span className="store-avatar"><Icon size={20} /></span><div><h2>{store.name}</h2><small>{store.address}</small></div></div>
                  <p>{store.tagline}</p>
                  <footer><span><Clock size={15} /> {store.deliveryTime}</span>{currentDistance !== undefined ? <span><MapPin size={15} /> {distanceLabel(currentDistance)}</span> : <span><Truck size={15} /> {store.calculatesDeliveryFee ? formatPrice(store.deliveryFee) : "A combinar"}</span>}</footer>
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

function MerchantHero({ merchant }: { merchant: Merchant }) {
  const Icon = iconByMerchant[merchant.icon];

  return (
    <section
      className="merchant-hero"
      style={{ "--merchant-color": merchant.palette } as CSSProperties}
    >
      <CatalogImage src={merchant.cover} alt={merchant.name} variant="merchant-cover" icon="store" />
      <div className="merchant-overlay" />
      <div className="merchant-info">
        <span className="merchant-logo">
          <Icon size={28} />
        </span>
        <div>
          <span className="merchant-segment">{merchant.segment}</span>
          <h1>{merchant.name}</h1>
          <p>{merchant.tagline}</p>
          <div className="merchant-meta">
            {merchant.rating !== null ? <span><CheckCircle2 size={16} />{merchant.rating.toFixed(1)}</span> : null}
            <span>
              <Clock size={16} />
              {merchant.deliveryTime}
            </span>
            {merchant.distance ? <span><Truck size={16} />{merchant.distance}</span> : null}
            <span>Min. {formatPrice(merchant.minimumOrder)}</span>
          </div>
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
  isCartOpen,
  totals,
  onCheckoutChange,
  onClose,
  onFulfillmentChange,
  onQuantityChange,
  onSendOrder,
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
  isCartOpen: boolean;
  totals: { subtotal: number; delivery: number; total: number };
  onCheckoutChange: (checkout: Checkout) => void;
  onClose: () => void;
  onFulfillmentChange: (mode: FulfillmentMode) => void;
  onQuantityChange: (productId: string, nextQuantity: number) => void;
  onSendOrder: () => void;
  locatingUser: boolean;
  locationStatus: string;
  onUseCurrentLocation: () => void;
}) {
  const disabled = cart.length === 0;

  return (
    <>
    <button className={isCartOpen ? "cart-backdrop open" : "cart-backdrop"} type="button" aria-label="Fechar carrinho" onClick={onClose} />
    <aside className={isCartOpen ? "cart-panel open" : "cart-panel"} aria-label="Carrinho e finalização do pedido">
      <div className="cart-header">
        <div>
          <span>Carrinho</span>
          <strong>{cartMerchant.name}</strong>
        </div>
        <button className="icon-button mobile-only" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="cart-scroll-area">
      {!cartIsFromActiveStore ? (
        <div className="cart-warning">
          Pedido iniciado em {cartMerchant.name}.
        </div>
      ) : null}

      <div className="cart-items">
        {cart.length === 0 ? (
          <div className="empty-cart">
            <ShoppingCart size={30} />
            <strong>Seu carrinho esta vazio</strong>
            <span>Escolha os produtos para montar a comanda.</span>
          </div>
        ) : (
          cart.map((item) => (
            <div className="cart-item" key={item.product.id}>
              <CatalogImage src={item.product.image} alt={item.product.name} variant="cart-item-image" />
              <div>
                <strong>{item.product.name}</strong>
                <span>
                  {formatPrice(item.product.price)}
                  {item.product.unit ? ` / ${item.product.unit}` : ""}
                </span>
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

      <div className="checkout-block">
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

        <label>
          <User size={16} />
          <input
            value={checkout.name}
            onChange={(event) =>
              onCheckoutChange({ ...checkout, name: event.target.value })
            }
            placeholder="Nome"
            autoComplete="name"
            aria-invalid={Boolean(checkoutError && checkout.name.trim().length < 2)}
          />
        </label>

        {fulfillment === "delivery" ? (
          <button className="checkout-location-button" type="button" onClick={onUseCurrentLocation} disabled={locatingUser}>
            {locatingUser ? <RefreshCw size={17} /> : <LocateFixed size={17} />}
            {locatingUser ? "Obtendo localização..." : hasCoordinates(checkout) ? "Atualizar minha localização" : "Usar minha localização"}
          </button>
        ) : null}

        {fulfillment === "delivery" && hasCoordinates(checkout) ? (
          <div className="checkout-location-confirmation">
            <CheckCircle2 size={16} />
            <span>Localização anexada à comanda</span>
            <a href={mapsUrl(checkout)} target="_blank" rel="noreferrer">Ver mapa</a>
          </div>
        ) : fulfillment === "delivery" && locationStatus ? (
          <p className="location-feedback">{locationStatus}</p>
        ) : null}

        {fulfillment === "delivery" ? (
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
        )}

        {fulfillment === "delivery" ? (
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
      </div>
      </div>

      <div className="cart-footer">
      <div className="cart-total">
        <span>
          Subtotal <strong>{formatPrice(totals.subtotal)}</strong>
        </span>
        <span>
          Taxa <strong>{fulfillment === "delivery" && !cartMerchant.calculatesDeliveryFee ? "A combinar" : formatPrice(totals.delivery)}</strong>
        </span>
        <span className="grand-total">
          {fulfillment === "delivery" && !cartMerchant.calculatesDeliveryFee ? "Total parcial" : "Total"} <strong>{formatPrice(totals.total)}</strong>
        </span>
      </div>

      <button
        className="whatsapp-button"
        disabled={disabled}
        onClick={onSendOrder}
      >
        <MessageCircle size={19} />
        Enviar comanda
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
