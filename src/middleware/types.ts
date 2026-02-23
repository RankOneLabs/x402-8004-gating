export type GatingMode = "payment" | "reputation" | "combined";

export interface PaymentConfig {
  basePrice: string; // e.g. "$0.01"
  network: string; // CAIP-2 e.g. "eip155:84532"
  payTo: string; // recipient address
}

export interface ReputationConfig {
  minScore: number; // 0-100 threshold
  tag1?: string; // primary reputation tag filter
  tag2?: string; // secondary reputation tag filter
}

export interface PriceTier {
  minScore: number; // minimum reputation score for this tier
  price: string; // price at this tier, e.g. "$0.001"
}

export interface GatingRouteConfig {
  mode: GatingMode;
  payment?: PaymentConfig;
  reputation?: ReputationConfig;
  priceTiers?: PriceTier[]; // for "combined" mode; must be sorted in descending order by minScore (highest score first)
  description?: string;
}

export type GatingRoutesConfig = Record<string, GatingRouteConfig>;
