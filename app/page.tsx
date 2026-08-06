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
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
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
  image: string;
  badge?: string;
  unit?: string;
};

type Merchant = {
  id: StoreId;
  name: string;
  segment: string;
  tagline: string;
  rating: number;
  distance: string;
  deliveryTime: string;
  minimumOrder: number;
  deliveryFee: number;
  whatsapp: string;
  address: string;
  cover: string;
  icon: "pizza" | "pill" | "hammer";
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
  phone: string;
  address: string;
  payment: string;
  notes: string;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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
    whatsapp: "5599999990001",
    address: "Av. Central, 320",
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
    whatsapp: "5599999990002",
    address: "Rua das Flores, 88",
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
    whatsapp: "5599999990003",
    address: "Av. Filadelfia, 1280 - Setor Industrial",
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
};

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
  phone: "",
  address: "",
  payment: "Pix",
  notes: "",
};

const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function formatPrice(value: number) {
  return currency.format(value);
}

function buildWhatsappMessage({
  merchant,
  cart,
  checkout,
  fulfillment,
  totals,
}: {
  merchant: Merchant;
  cart: CartItem[];
  checkout: Checkout;
  fulfillment: FulfillmentMode;
  totals: { subtotal: number; delivery: number; total: number };
}) {
  const items = cart
    .map(
      (item) =>
        `${item.quantity}x ${item.product.name}${
          item.product.unit ? ` (${item.product.unit})` : ""
        } - ${formatPrice(
          item.product.price * item.quantity,
        )}`,
    )
    .join("\n");

  const deliveryLine =
    fulfillment === "delivery"
      ? `Entrega: ${checkout.address || "Endereco a confirmar"}`
      : `Retirada: ${merchant.address}`;

  return [
    `*Pedido - ${merchant.name}*`,
    "",
    `Cliente: ${checkout.name || "A confirmar"}`,
    `Telefone: ${checkout.phone || "A confirmar"}`,
    deliveryLine,
    `Pagamento: ${checkout.payment}`,
    "",
    "*Itens*",
    items,
    "",
    `Subtotal: ${formatPrice(totals.subtotal)}`,
    `Taxa: ${formatPrice(totals.delivery)}`,
    `Total: ${formatPrice(totals.total)}`,
    checkout.notes ? `\nObservacoes: ${checkout.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function Home() {
  const [merchants, setMerchants] = useState<Merchant[]>(
    hasSupabaseConfig ? [] : fallbackMerchants,
  );
  const [activeStoreId, setActiveStoreId] = useState<StoreId>("bella-massa");
  const [activeCategory, setActiveCategory] = useState("Mais pedidos");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("catalog");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("delivery");
  const [checkout, setCheckout] = useState<Checkout>(initialCheckout);
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

      const { data, error } = await supabase
        .from("stores")
        .select("*, categories(*), products(*)")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error || cancelled) return;
      if (!data?.length) {
        setMerchants([]);
        return;
      }

      const loadedMerchants = data.flatMap((store) => {
        const fallback = fallbackMerchants.find(
          (item) => item.id === store.slug,
        ) ?? fallbackMerchants[0];

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
              fallback.products.find((item) => item.name === product.name)
                ?.image ??
              fallback.cover,
            badge: product.badge ?? undefined,
            unit: product.unit ?? undefined,
          }));

        return [
          {
            ...fallback,
            id: store.slug,
            name: store.name,
            address: store.address ?? fallback.address,
            whatsapp: store.whatsapp_phone,
            minimumOrder: Number(store.minimum_order),
            deliveryFee: Number(store.delivery_fee),
            deliveryTime: store.delivery_time_label ?? fallback.deliveryTime,
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
        setActiveStoreId((current) =>
          loadedMerchants.some((store) => store.id === current)
            ? current
            : loadedMerchants[0].id,
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
      setCheckout(JSON.parse(savedCheckout) as Checkout);
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
    const delivery = subtotal > 0 && fulfillment === "delivery" ? deliveryFee : 0;

    return {
      subtotal,
      delivery,
      total: subtotal + delivery,
    };
  }, [cart, cartMerchant?.deliveryFee, fulfillment, merchant.deliveryFee]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartIsFromActiveStore = !cartMerchant || cartMerchant.id === merchant.id;

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
    setIsCartOpen(true);
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
    const message = buildWhatsappMessage({
      merchant: targetMerchant,
      cart,
      checkout,
      fulfillment,
      totals,
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
      <header className="topbar">
        <button
          className="brand-lockup"
          onClick={() => setView("catalog")}
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

        <div className="location-pill">
          <MapPin size={17} />
          <span>Entrega em Araguaina</span>
          <ChevronRight size={16} />
        </div>

        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              merchants.length ? `Buscar em ${merchant.name}` : "Buscar no catalogo"
            }
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
              onClick={() => window.location.assign("/admin")}
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
        ) : (
        <section className="commerce-grid">
          <aside className="store-rail" aria-label="Lojas">
            {merchants.map((store) => {
              const Icon = iconByMerchant[store.icon];
              const active = store.id === merchant.id;

              return (
                <button
                  className={active ? "store-tile active" : "store-tile"}
                  key={store.id}
                  onClick={() => openCatalog(store.id)}
                  aria-pressed={active}
                  style={{ "--store-color": store.palette } as CSSProperties}
                >
                  <span className="store-avatar">
                    <Icon size={20} />
                  </span>
                  <span>
                    <strong>{store.name}</strong>
                    <small>{store.segment}</small>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="catalog-surface" key={merchant.id}>
            <MerchantHero merchant={merchant} />

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
              <div className="product-grid">
                {filteredProducts.map((product) => {
                const quantity =
                  cart.find((item) => item.product.id === product.id)?.quantity ??
                  0;

                return (
                  <article className="product-card" key={product.id}>
                    <img src={product.image} alt={product.name} />
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
            merchant={merchant}
            totals={totals}
            onCheckoutChange={setCheckout}
            onClose={() => setIsCartOpen(false)}
            onFulfillmentChange={setFulfillment}
            onQuantityChange={updateQuantity}
            onSendOrder={sendWhatsappOrder}
          />

          {cartCount > 0 ? (
            <button
              className="mobile-cart-bar"
              onClick={() => setIsCartOpen(true)}
            >
              <span>
                <ShoppingCart size={18} />
                {cartCount} itens
              </span>
              <strong>{formatPrice(totals.total)}</strong>
            </button>
          ) : null}
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

function MerchantHero({ merchant }: { merchant: Merchant }) {
  const Icon = iconByMerchant[merchant.icon];

  return (
    <section
      className="merchant-hero"
      style={{ "--merchant-color": merchant.palette } as CSSProperties}
    >
      <img src={merchant.cover} alt={merchant.name} />
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
            <span>
              <CheckCircle2 size={16} />
              {merchant.rating.toFixed(1)}
            </span>
            <span>
              <Clock size={16} />
              {merchant.deliveryTime}
            </span>
            <span>
              <Truck size={16} />
              {merchant.distance}
            </span>
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
  fulfillment,
  isCartOpen,
  merchant,
  totals,
  onCheckoutChange,
  onClose,
  onFulfillmentChange,
  onQuantityChange,
  onSendOrder,
}: {
  cart: CartItem[];
  cartMerchant: Merchant;
  cartIsFromActiveStore: boolean;
  checkout: Checkout;
  fulfillment: FulfillmentMode;
  isCartOpen: boolean;
  merchant: Merchant;
  totals: { subtotal: number; delivery: number; total: number };
  onCheckoutChange: (checkout: Checkout) => void;
  onClose: () => void;
  onFulfillmentChange: (mode: FulfillmentMode) => void;
  onQuantityChange: (productId: string, nextQuantity: number) => void;
  onSendOrder: () => void;
}) {
  const disabled = cart.length === 0;

  return (
    <aside className={isCartOpen ? "cart-panel open" : "cart-panel"}>
      <div className="cart-header">
        <div>
          <span>Carrinho</span>
          <strong>{cartMerchant.name}</strong>
        </div>
        <button className="icon-button mobile-only" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

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
              <img src={item.product.image} alt={item.product.name} />
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
          />
        </label>

        <label>
          <MessageCircle size={16} />
          <input
            value={checkout.phone}
            onChange={(event) =>
              onCheckoutChange({ ...checkout, phone: event.target.value })
            }
            placeholder="Telefone"
          />
        </label>

        {fulfillment === "delivery" ? (
          <label>
            <MapPin size={16} />
            <input
              value={checkout.address}
              onChange={(event) =>
                onCheckoutChange({ ...checkout, address: event.target.value })
              }
              placeholder="Endereco"
            />
          </label>
        ) : (
          <div className="pickup-address">
            <MapPin size={16} />
            <span>{merchant.address}</span>
          </div>
        )}

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

        <textarea
          value={checkout.notes}
          onChange={(event) =>
            onCheckoutChange({ ...checkout, notes: event.target.value })
          }
          placeholder="Observacoes"
        />
      </div>

      <div className="cart-total">
        <span>
          Subtotal <strong>{formatPrice(totals.subtotal)}</strong>
        </span>
        <span>
          Taxa <strong>{formatPrice(totals.delivery)}</strong>
        </span>
        <span className="grand-total">
          Total <strong>{formatPrice(totals.total)}</strong>
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
    </aside>
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
