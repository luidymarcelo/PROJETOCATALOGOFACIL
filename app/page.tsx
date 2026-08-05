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
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type StoreId = "bella-massa" | "farmacia-vida" | "construmais";
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

const merchants: Merchant[] = [
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
    name: "Construmais Materiais",
    segment: "Material de construcao",
    tagline: "Acabamento, ferramentas, eletrica e entrega no bairro.",
    rating: 4.7,
    distance: "2,4 km",
    deliveryTime: "60-90 min",
    minimumOrder: 40,
    deliveryFee: 12,
    whatsapp: "5599999990003",
    address: "BR 010, Quadra 12",
    cover:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
    icon: "hammer",
    palette: "#2563eb",
    categories: ["Mais pedidos", "Cimento", "Ferramentas", "Eletrica"],
    integration: {
      mode: "Banco legado",
      status: "Pendente",
      cadence: "Agendado 06:00 e 18:00",
      source: "ODBC/SQL interno",
      lastSync: "Ontem, 18:00",
    },
    products: [
      {
        id: "cimento-cp2",
        name: "Cimento CP II 50 kg",
        description: "Saco fechado, retirada ou entrega local.",
        category: "Cimento",
        price: 38.5,
        badge: "Estoque alto",
        unit: "saco",
        image:
          "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "furadeira",
        name: "Furadeira Impacto 650 W",
        description: "Mandril 3/8, velocidade variavel e maleta.",
        category: "Ferramentas",
        price: 189.9,
        image:
          "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "tomada-20a",
        name: "Tomada 20 A Branca",
        description: "Modulo padrao brasileiro para instalacao residencial.",
        category: "Eletrica",
        price: 9.9,
        unit: "un",
        image:
          "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&w=800&q=80",
      },
      {
        id: "tinta-acrilica",
        name: "Tinta Acrilica 18 L",
        description: "Acabamento fosco, alta cobertura, cor branco neve.",
        category: "Mais pedidos",
        price: 219.9,
        badge: "Entrega hoje",
        image:
          "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80",
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
  Ferramentas: Hammer,
  Eletrica: SlidersHorizontal,
};

const initialCheckout: Checkout = {
  name: "",
  phone: "",
  address: "",
  payment: "Pix",
  notes: "",
};

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
        `${item.quantity}x ${item.product.name} - ${formatPrice(
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
  const [activeStoreId, setActiveStoreId] = useState<StoreId>("bella-massa");
  const [activeCategory, setActiveCategory] = useState("Mais pedidos");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("catalog");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>("delivery");
  const [checkout, setCheckout] = useState<Checkout>(initialCheckout);
  const [syncLog, setSyncLog] = useState<Record<StoreId, string>>({
    "bella-massa": merchants[0].integration.lastSync,
    "farmacia-vida": merchants[1].integration.lastSync,
    construmais: merchants[2].integration.lastSync,
  });

  const merchant =
    merchants.find((store) => store.id === activeStoreId) ?? merchants[0];

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
            placeholder={`Buscar em ${merchant.name}`}
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
            onClick={() => setView("admin")}
          >
            <Settings size={18} />
            <span>Config</span>
          </button>
        </div>
      </header>

      {view === "catalog" ? (
        <section className="commerce-grid">
          <aside className="store-rail" aria-label="Lojas">
            {merchants.map((store) => {
              const Icon = iconByMerchant[store.icon];
              const active = store.id === merchant.id;

              return (
                <button
                  className={active ? "store-tile active" : "store-tile"}
                  key={store.id}
                  onClick={() => setActiveStoreId(store.id)}
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

          <section className="catalog-surface">
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
                        <strong>{formatPrice(product.price)}</strong>
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
      ) : (
        <AdminPanel
          merchants={merchants}
          syncLog={syncLog}
          onOpenCatalog={(storeId) => {
            setActiveStoreId(storeId);
            setView("catalog");
          }}
          onSync={simulateSync}
        />
      )}
    </main>
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
                <span>{formatPrice(item.product.price)}</span>
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
